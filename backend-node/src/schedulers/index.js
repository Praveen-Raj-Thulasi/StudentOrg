import cron from 'node-cron';
import { BookingService } from '../services/booking.service.js';
import { Event } from '../models/Event.js';
import { ApprovalRequest } from '../models/ApprovalRequest.js';
import { certificateService } from '../services/certificate.service.js';
import { Membership } from '../models/Membership.js';
import { notificationService } from '../services/notification.service.js';
import { logger } from '../utils/logger.js';

let cronTasks = [];

/** Send one durable renewal reminder at 30, 7, and 1 day before membership expiry. */
export async function sendMembershipRenewalReminders(now = new Date()) {
  const memberships = await Membership.find({
    status: 'ACTIVE',
    validUntil: { $gt: now, $lte: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) },
  }).select('id userId validUntil renewalReminderDaysSent').lean();

  let sent = 0;
  for (const membership of memberships) {
    const daysRemaining = Math.ceil((new Date(membership.validUntil).getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    const alreadySent = membership.renewalReminderDaysSent || [];
    const reminderDay = [30, 7, 1].find((day) => daysRemaining <= day && !alreadySent.includes(day));
    if (!reminderDay) continue;

    // Claim the reminder atomically so multiple backend replicas cannot send duplicates.
    const claimed = await Membership.findOneAndUpdate(
      { _id: membership._id, renewalReminderDaysSent: { $ne: reminderDay } },
      { $addToSet: { renewalReminderDaysSent: reminderDay } },
      { new: true }
    );
    if (!claimed) continue;

    await notificationService.sendNotification(
      membership.userId,
      'USER',
      'MEMBERSHIP_RENEWAL',
      `Membership expires in ${reminderDay} day${reminderDay === 1 ? '' : 's'}`,
      'Renew your Student Association membership to keep member benefits active.',
      '/profile'
    );
    sent++;
  }
  return sent;
}

/**
 * 1. Release expired seat reservations for unpaid bookings older than 10 minutes.
 * Safe to retry idempotently.
 */
export async function releaseExpiredPaymentReservations() {
  try {
    const released = await BookingService.releaseExpiredReservations();
    if (released > 0) {
      logger.info(`[Scheduler] Released ${released} expired booking reservation(s)`);
    }
    return released;
  } catch (err) {
    logger.error({ err }, '[Scheduler] Error in releaseExpiredPaymentReservations');
    return 0;
  }
}

/**
 * 2. Auto-approve and publish events stuck in review longer than 10 minutes.
 * Safe to retry idempotently.
 */
export async function autoApproveAndPublishEvents() {
  const cutoff = new Date(Date.now() - 10 * 60 * 1000);
  let approvedCount = 0;

  try {
    // Pass 1: approval requests
    const pendingApprovals = await ApprovalRequest.find({
      status: 'PENDING',
      requestedAt: { $lt: cutoff },
    });

    for (const req of pendingApprovals) {
      try {
        req.status = 'APPROVED';
        req.reviewedAt = new Date();
        req.reviewNote = 'Auto-approved after 10-minute review SLA';
        await req.save();

        await Event.findOneAndUpdate(
          { id: req.eventId, status: { $ne: 'CANCELLED' } },
          { status: 'PUBLISHED' }
        );
        approvedCount++;
      } catch (err) {
        logger.warn({ err, reqId: req.id }, '[Scheduler] Failed auto-approving request');
      }
    }

    // Pass 2: stuck events safety net
    const stuckEvents = await Event.find({
      status: { $in: ['PENDING_APPROVAL', 'APPROVED'] },
      createdAt: { $lt: cutoff },
    });

    for (const event of stuckEvents) {
      try {
        event.status = 'PUBLISHED';
        await event.save();
        approvedCount++;
      } catch (err) {
        logger.warn({ err, eventId: event.id }, '[Scheduler] Failed publishing stuck event');
      }
    }

    if (approvedCount > 0) {
      logger.info(`[Scheduler] Auto-approved/published ${approvedCount} pending event(s)`);
    }
  } catch (err) {
    logger.error({ err }, '[Scheduler] Error in autoApproveAndPublishEvents');
  }

  return approvedCount;
}

/**
 * 3. Full event lifecycle transitions.
 * PUBLISHED/UPCOMING -> LIVE
 * LIVE/PUBLISHED -> COMPLETED
 * COMPLETED -> EXPIRED
 * Safe to retry idempotently.
 */
export async function runLifecycleTransitions() {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const today = new Date(todayStr);

  let liveCount = 0;
  let completedCount = 0;
  let expiredCount = 0;

  try {
    // 1. Transition to LIVE: eventDate <= today <= endDate
    const upcomingEvents = await Event.find({
      status: { $in: ['PUBLISHED', 'UPCOMING'] },
      eventDate: { $lte: today },
    });

    for (const e of upcomingEvents) {
      const end = e.endDate ? new Date(e.endDate) : e.eventDate;
      if (end >= today) {
        e.status = 'LIVE';
        await e.save();
        liveCount++;
      }
    }

    // 2. Transition to COMPLETED: endDate (or eventDate) has passed
    const activeEvents = await Event.find({
      status: { $in: ['LIVE', 'PUBLISHED', 'UPCOMING', 'ONGOING'] },
    });

    for (const e of activeEvents) {
      const end = e.endDate ? new Date(e.endDate) : (e.eventDate ? new Date(e.eventDate) : null);
      if (end && end < today) {
        e.status = 'COMPLETED';
        await e.save();
        completedCount++;
      }
    }

    // 3. Transition to EXPIRED: certificateDeadline or eventDate + 7 days passed
    const completedEvents = await Event.find({ status: 'COMPLETED' });
    for (const e of completedEvents) {
      const certDeadline = e.certificateDeadline
        ? new Date(e.certificateDeadline)
        : (e.eventDate ? new Date(new Date(e.eventDate).getTime() + 7 * 24 * 60 * 60 * 1000) : null);

      if (certDeadline && certDeadline < today) {
        e.status = 'EXPIRED';
        await e.save();
        expiredCount++;
      }
    }

    if (liveCount + completedCount + expiredCount > 0) {
      logger.info(`[Scheduler] Lifecycle transitions: ${liveCount} -> LIVE, ${completedCount} -> COMPLETED, ${expiredCount} -> EXPIRED`);
    }
  } catch (err) {
    logger.error({ err }, '[Scheduler] Error in runLifecycleTransitions');
  }

  return { liveCount, completedCount, expiredCount };
}

/**
 * 4. Daily recovery for missing certificates on completed events.
 */
export async function recoverMissingCertificates() {
  try {
    const completedEvents = await Event.find({
      status: { $in: ['COMPLETED', 'EXPIRED'] },
      hasCertificate: true,
    });

    let totalGenerated = 0;
    for (const event of completedEvents) {
      try {
        const result = await certificateService.generateCertificatesForEvent(
          event.id,
          event.organizerId
        );
        totalGenerated += result.generated;
      } catch (err) {
        // Skip individual event failures
      }
    }

    if (totalGenerated > 0) {
      logger.info(`[Scheduler] Auto-recovered ${totalGenerated} missing certificate(s)`);
    }
    return totalGenerated;
  } catch (err) {
    logger.error({ err }, '[Scheduler] Error in recoverMissingCertificates');
    return 0;
  }
}

/**
 * Start background node-cron schedules.
 */
export function startSchedulers() {
  if (process.env.NODE_ENV === 'test') {
    logger.info('[Scheduler] Test environment detected; cron tasks not registered automatically');
    return;
  }

  logger.info('[Scheduler] Registering background cron tasks...');

  // 1. Expired booking release & seat rollback: every minute
  const taskBooking = cron.schedule('* * * * *', async () => {
    await releaseExpiredPaymentReservations();
  });
  cronTasks.push(taskBooking);

  // 2. Auto-approve & publish pending events: every minute
  const taskApprovals = cron.schedule('* * * * *', async () => {
    await autoApproveAndPublishEvents();
  });
  cronTasks.push(taskApprovals);

  // 3. Lifecycle transitions (LIVE, COMPLETED, EXPIRED): every hour
  const taskLifecycle = cron.schedule('0 * * * *', async () => {
    await runLifecycleTransitions();
  });
  cronTasks.push(taskLifecycle);

  // 4. Daily certificate recovery: at 02:00 AM daily
  const taskCertRecovery = cron.schedule('0 2 * * *', async () => {
    await recoverMissingCertificates();
  });
  cronTasks.push(taskCertRecovery);

  // 5. Membership renewal reminders: every morning in the association's local timezone.
  const taskMembershipRenewals = cron.schedule('0 9 * * *', async () => {
    try {
      const sent = await sendMembershipRenewalReminders();
      if (sent > 0) logger.info(`[Scheduler] Sent ${sent} membership renewal reminder(s)`);
    } catch (err) {
      logger.error({ err }, '[Scheduler] Error sending membership renewal reminders');
    }
  }, { timezone: 'Asia/Kolkata' });
  cronTasks.push(taskMembershipRenewals);

  logger.info('[Scheduler] All background schedulers started successfully');
}

/**
 * Stop all running cron tasks (e.g. for graceful shutdown).
 */
export function stopSchedulers() {
  for (const task of cronTasks) {
    task.stop();
  }
  cronTasks = [];
  logger.info('[Scheduler] All background schedulers stopped');
}
