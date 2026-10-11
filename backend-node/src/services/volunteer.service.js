import mongoose from 'mongoose';
import {
  VolunteerTask,
  VolunteerApplication,
  Event,
  User,
  Booking,
  AuditLog,
  UserInterest,
  UserAchievement,
  Reimbursement,
  Notification,
} from '../models/index.js';
import { NotFoundError, ForbiddenError, BadRequestError } from '../utils/errors.js';
import { GamificationService } from './gamification.service.js';
import { FinanceService } from './finance.service.js';
import notificationService from './notification.service.js';
import logger from '../utils/logger.js';

export class VolunteerService {
  /**
   * Get all tasks assigned to the authenticated volunteer.
   */
  static async getMyTasks(volunteerId, status = null) {
    const filter = { volunteerId: Number(volunteerId) };
    if (status && status !== 'ALL') {
      filter.status = String(status).toUpperCase();
    }

    const tasks = await VolunteerTask.find(filter)
      .populate('event', 'title eventName startDate endDate location venue status')
      .sort({ dueDate: 1, createdAt: -1 });

    return tasks.map((t) => this.toTaskResponse(t));
  }

  /**
   * Get single task verifying ownership.
   */
  static async getTask(taskId, volunteerId) {
    let task = null;
    if (typeof taskId === 'string' && /^[0-9a-fA-F]{24}$/.test(taskId)) {
      task = await VolunteerTask.findById(taskId).populate(
        'event',
        'title eventName startDate endDate location venue status'
      );
    } else if (!isNaN(Number(taskId))) {
      task = await VolunteerTask.findOne({ id: Number(taskId) }).populate(
        'event',
        'title eventName startDate endDate location venue status'
      );
    }

    if (!task) {
      throw new NotFoundError('Volunteer task not found');
    }

    if (task.volunteerId !== Number(volunteerId)) {
      throw new ForbiddenError('Access denied: You do not own this volunteer task');
    }

    return this.toTaskResponse(task);
  }

  /**
   * Update task status, evidence & completion notes (enforcing ownership & permitted transitions).
   */
  static async updateTaskStatus(
    taskId,
    volunteerId,
    { status, completionNotes, evidenceUrl, evidenceNotes } = {}
  ) {
    let task = null;
    if (typeof taskId === 'string' && /^[0-9a-fA-F]{24}$/.test(taskId)) {
      task = await VolunteerTask.findById(taskId);
    } else if (!isNaN(Number(taskId))) {
      task = await VolunteerTask.findOne({ id: Number(taskId) });
    }

    if (!task) {
      throw new NotFoundError('Volunteer task not found');
    }

    if (task.volunteerId !== Number(volunteerId)) {
      throw new ForbiddenError('Access denied: You do not own this volunteer task');
    }

    const validStatuses = ['PENDING', 'ACCEPTED', 'IN_PROGRESS', 'SUBMITTED_FOR_REVIEW', 'COMPLETED'];
    const targetStatus = String(status).toUpperCase();

    if (!validStatuses.includes(targetStatus)) {
      throw new BadRequestError(`Invalid status transition. Allowed values: ${validStatuses.join(', ')}`);
    }

    // State transition rules: cannot revert COMPLETED to earlier states
    if (task.status === 'COMPLETED' && targetStatus !== 'COMPLETED') {
      throw new BadRequestError('Completed tasks cannot be reopened or transitioned back to pending/in-progress');
    }

    task.status = targetStatus;
    if (completionNotes !== undefined) {
      task.completionNotes = completionNotes ? String(completionNotes).trim() : null;
    }
    if (evidenceUrl !== undefined) {
      task.evidenceUrl = evidenceUrl ? String(evidenceUrl).trim() : null;
    }
    if (evidenceNotes !== undefined) {
      task.evidenceNotes = evidenceNotes ? String(evidenceNotes).trim() : null;
    }

    if (targetStatus === 'COMPLETED') {
      task.completedAt = task.completedAt || new Date();
    }

    await task.save();

    await this.recordAudit(
      volunteerId,
      'VOLUNTEER',
      'VOLUNTEER_TASK_UPDATED',
      'VOLUNTEER_TASK',
      String(task.id),
      `Task ${task.id} transitioned to ${targetStatus}`
    );

    return this.toTaskResponse(task);
  }

  /**
   * Create a new task (restricted to Organizer, President, Admin).
   * Prevents volunteers from assigning tasks to themselves.
   */
  static async createTask(actorId, data) {
    const { title, description, volunteerId, assignedTo, eventId, priority, dueDate } = data;

    if (!title || !title.trim()) {
      throw new BadRequestError('Task title is required');
    }

    const targetVolunteerId = volunteerId !== undefined ? volunteerId : assignedTo;
    const numVolunteerId = Number(targetVolunteerId);
    if (isNaN(numVolunteerId)) {
      throw new BadRequestError('Valid volunteerId is required');
    }

    if (Number(actorId) === numVolunteerId || String(actorId) === String(targetVolunteerId)) {
      throw new ForbiddenError('Volunteers cannot assign tasks to themselves');
    }

    const volunteerUser = await User.findOne({ id: numVolunteerId });
    if (!volunteerUser) {
      throw new NotFoundError('Target volunteer user not found');
    }

    const volunteerRoles = Array.isArray(volunteerUser.roles) ? volunteerUser.roles : [volunteerUser.role];
    if (!volunteerRoles.includes('VOLUNTEER')) {
      throw new BadRequestError(`Target user is not registered as a VOLUNTEER (current roles: ${volunteerRoles.join(', ')})`);
    }

    let eventDoc = null;
    if (eventId) {
      if (typeof eventId === 'string' && /^[0-9a-fA-F]{24}$/.test(eventId)) {
        eventDoc = await Event.findById(eventId);
      } else if (!isNaN(Number(eventId))) {
        eventDoc = await Event.findOne({ id: Number(eventId) });
      }
      if (!eventDoc) {
        throw new NotFoundError('Associated event not found');
      }

      // If actor is organizer, verify ownership
      const numActorId = Number(actorId);
      if (eventDoc.organizerId !== numActorId && String(eventDoc.organizerId) !== String(actorId)) {
        const actorUser = await User.findOne({ id: numActorId || 0 });
        const isExec = actorUser && (actorUser.role === 'ADMIN' || (Array.isArray(actorUser.roles) && actorUser.roles.includes('PRESIDENT')));
        if (!isExec) {
          throw new ForbiddenError('Unauthorized: You do not own this event');
        }
      }

      // Check volunteer capacity
      if (eventDoc.volunteerCapacity && eventDoc.volunteerCapacity > 0) {
        const assignedCount = await VolunteerTask.countDocuments({ eventId: eventDoc.id });
        if (assignedCount >= eventDoc.volunteerCapacity) {
          throw new BadRequestError(`Event volunteer capacity of ${eventDoc.volunteerCapacity} has been reached`);
        }
      }
    }

    const task = new VolunteerTask({
      title: title.trim(),
      description: description ? description.trim() : '',
      volunteerId: numVolunteerId,
      volunteer: volunteerUser._id,
      assignedBy: actorId,
      eventId: eventDoc ? eventDoc.id : null,
      event: eventDoc ? eventDoc._id : null,
      priority: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'].includes(String(priority).toUpperCase())
        ? String(priority).toUpperCase()
        : 'MEDIUM',
      dueDate: dueDate ? new Date(dueDate) : null,
      status: 'PENDING',
    });

    await task.save();

    await this.recordAudit(
      actorId,
      'ORGANIZER',
      'VOLUNTEER_TASK_CREATED',
      'VOLUNTEER_TASK',
      String(task.id),
      `Task ${task.id} created for volunteer ${numVolunteerId}`
    );

    return this.toTaskResponse(task);
  }

  /**
   * Get all tasks for events managed by this organizer.
   */
  static async getOrganizerTasks(actorId, { eventId, status } = {}) {
    const numActorId = Number(actorId);
    const myEvents = await Event.find({ $or: [{ organizerId: numActorId }, { organizerId: actorId }] }).select('id _id').lean();
    let eventIds = myEvents.map((e) => e.id);

    if (eventId && eventId !== 'ALL') {
      let evDoc = null;
      if (typeof eventId === 'string' && /^[0-9a-fA-F]{24}$/.test(eventId)) {
        evDoc = await Event.findById(eventId);
      } else if (!isNaN(Number(eventId))) {
        evDoc = await Event.findOne({ id: Number(eventId) });
      }
      if (!evDoc || (evDoc.organizerId !== numActorId && String(evDoc.organizerId) !== String(actorId))) {
        throw new ForbiddenError('Unauthorized: You do not own this event');
      }
      eventIds = [evDoc.id];
    }

    const filter = { eventId: { $in: eventIds } };
    if (status && status !== 'ALL') {
      filter.status = String(status).toUpperCase();
    }

    const tasks = await VolunteerTask.find(filter)
      .populate('event', 'eventName title startDate endDate location venue status')
      .populate('volunteer', 'id name email department organizationName memberNumber')
      .sort({ dueDate: 1, createdAt: -1 });

    return tasks.map((t) => this.toTaskResponse(t));
  }

  /**
   * List available registered volunteers for assignment.
   */
  static async getAvailableVolunteers() {
    const volunteers = await User.find({
      $or: [{ role: 'VOLUNTEER' }, { roles: 'VOLUNTEER' }],
    })
      .select('id name email department organizationName memberNumber roles role')
      .sort({ name: 1 })
      .lean();

    return volunteers.map((v) => ({
      id: v.id,
      name: v.name,
      email: v.email,
      roles: Array.isArray(v.roles) ? v.roles : [v.role].filter(Boolean),
      department: v.department || '',
      memberNumber: v.memberNumber || null,
      college: v.organizationName || '',
    }));
  }

  /**
   * Organizer/Executive reviews and verifies completion of a volunteer task.
   * Volunteers cannot verify their own tasks.
   * Official contribution points are awarded to the volunteer.
   */
  static async verifyTaskCompletion(
    actorId,
    taskId,
    { verificationNotes = '', verified = true, pointsAwarded = 50 } = {}
  ) {
    let task = null;
    if (typeof taskId === 'string' && /^[0-9a-fA-F]{24}$/.test(taskId)) {
      task = await VolunteerTask.findById(taskId).populate('event');
    } else if (!isNaN(Number(taskId))) {
      task = await VolunteerTask.findOne({ id: Number(taskId) }).populate('event');
    }
    if (!task) {
      throw new NotFoundError('Volunteer task not found');
    }

    if (task.volunteerId === Number(actorId) || String(task.volunteer) === String(actorId)) {
      throw new ForbiddenError('Security violation: Volunteers cannot verify their own tasks or award points');
    }

    // Verify organizer owns the event or is executive
    const numActorId = Number(actorId);
    if (task.event && task.event.organizerId !== numActorId && String(task.event.organizerId) !== String(actorId)) {
      const actorUser = await User.findOne({ id: numActorId || 0 });
      const isExec = actorUser && (actorUser.role === 'ADMIN' || (Array.isArray(actorUser.roles) && actorUser.roles.includes('PRESIDENT')));
      if (!isExec) {
        throw new ForbiddenError('Unauthorized: You do not own this event');
      }
    }

    const targetStatus = verified ? 'COMPLETED' : 'IN_PROGRESS';
    task.status = targetStatus;
    if (targetStatus === 'COMPLETED') {
      task.completedAt = task.completedAt || new Date();
      task.verifiedBy = numActorId;
      task.verifiedAt = new Date();
      const points = Number(pointsAwarded) || 50;
      task.pointsAwarded = points;

      // Award authoritative contribution points
      try {
        const level = await GamificationService.getOrCreateLevel(task.volunteerId);
        level.totalXp = (level.totalXp || 0) + points;
        level.currentLevel = GamificationService.computeLevel(level.totalXp);
        await level.save();
      } catch (err) {
        logger.warn({ err }, '[VolunteerService] Failed to update gamification XP');
      }

      // Send notification to volunteer
      await notificationService
        .sendNotification(
          task.volunteerId,
          'USER',
          'VOLUNTEER_TASK_VERIFIED',
          'Volunteer Duty Verified',
          `Your task "${task.title}" has been verified! You earned ${points} contribution points.`,
          '/volunteer/dashboard'
        )
        .catch(() => {});
    }

    if (verificationNotes) {
      task.completionNotes = task.completionNotes
        ? `${task.completionNotes} | Verified: ${verificationNotes.trim()}`
        : `Verified: ${verificationNotes.trim()}`;
    }
    await task.save();

    await this.recordAudit(
      actorId,
      'ORGANIZER',
      'VOLUNTEER_TASK_VERIFIED',
      'VOLUNTEER_TASK',
      String(task.id),
      `Task ${task.id} verified as ${targetStatus} by actor ${actorId}`
    );

    return this.toTaskResponse(task);
  }

  /**
   * Get dashboard overview for current volunteer.
   */
  static async getVolunteerDashboard(volunteerId) {
    const numId = Number(volunteerId);

    const [user, allTasks, upcomingEvents, attendedBookings, level, myApps, myClaims, unreadNotifs] =
      await Promise.all([
        User.findOne({ id: numId }).lean(),
        VolunteerTask.find({ volunteerId: numId })
          .populate('event', 'title eventName startDate endDate location venue status')
          .sort({ dueDate: 1, createdAt: -1 }),
        Event.find({
          status: 'PUBLISHED',
          $or: [
            { eventDate: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
            { startDate: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
          ],
        })
          .select('id title eventName description startDate endDate location venue liveAnnouncements')
          .sort({ startDate: 1 })
          .limit(5)
          .lean(),
        Booking.countDocuments({
          userId: numId,
          attendanceStatus: 'PRESENT',
        }),
        GamificationService.getOrCreateLevel(numId),
        VolunteerApplication.find({
          volunteerId: numId,
          status: { $in: ['PENDING', 'APPROVED'] },
        }).lean(),
        Reimbursement.find({ claimantId: numId }).lean(),
        Notification.countDocuments({ recipientId: numId, read: false }),
      ]);

    let pendingTasks = 0;
    let acceptedTasks = 0;
    let inProgressTasks = 0;
    let submittedTasks = 0;
    let completedTasks = 0;

    for (const t of allTasks) {
      if (t.status === 'PENDING') pendingTasks++;
      else if (t.status === 'ACCEPTED') acceptedTasks++;
      else if (t.status === 'IN_PROGRESS') inProgressTasks++;
      else if (t.status === 'SUBMITTED_FOR_REVIEW') submittedTasks++;
      else if (t.status === 'COMPLETED') completedTasks++;
    }

    // Reimbursement calculations
    let totalReimbursementsAmount = 0;
    let pendingClaimsCount = 0;
    let approvedClaimsCount = 0;
    let paidClaimsCount = 0;
    for (const c of myClaims) {
      totalReimbursementsAmount += c.amount || 0;
      if (c.status === 'SUBMITTED' || c.status === 'UNDER_REVIEW') pendingClaimsCount++;
      else if (c.status === 'APPROVED') approvedClaimsCount++;
      else if (c.status === 'PAID') paidClaimsCount++;
    }

    // Live announcements from upcoming events
    const announcements = [];
    for (const ev of upcomingEvents) {
      if (Array.isArray(ev.liveAnnouncements)) {
        for (const ann of ev.liveAnnouncements) {
          announcements.push({
            eventId: ev.id,
            eventTitle: ev.title || ev.eventName,
            message: ann.message,
            postedAt: ann.postedAt,
          });
        }
      }
    }

    return {
      volunteerId: numId,
      profile: {
        id: user?.id,
        name: user?.name,
        email: user?.email,
        memberNumber: user?.memberNumber,
        userCode: user?.userCode,
        roles: Array.isArray(user?.roles) ? user?.roles : [user?.role].filter(Boolean),
        department: user?.department || user?.organizationName || '',
      },
      summary: {
        totalTasks: allTasks.length,
        pendingTasks,
        acceptedTasks,
        inProgressTasks,
        submittedTasks,
        completedTasks,
        eventDutiesCount: upcomingEvents.length,
        verifiedAttendanceCount: attendedBookings,
        activeApplicationsCount: myApps.length,
        contributionScore: level.totalXp || 0,
        currentLevel: level.currentLevel || 1,
        reimbursements: {
          totalClaims: myClaims.length,
          totalAmount: totalReimbursementsAmount,
          pendingCount: pendingClaimsCount,
          approvedCount: approvedClaimsCount,
          paidCount: paidClaimsCount,
        },
      },
      recentTasks: allTasks.slice(0, 5).map((t) => this.toTaskResponse(t)),
      upcomingDuties: upcomingEvents.map((e) => ({
        id: e.id,
        title: e.title || e.eventName,
        startDate: e.startDate,
        endDate: e.endDate,
        location: e.location || e.venue || 'Campus Main Grounds',
      })),
      recentAnnouncements: announcements.slice(0, 5),
      unreadNotificationsCount: unreadNotifs,
      digitalId: {
        name: user?.name,
        memberNumber: user?.memberNumber,
        userCode: user?.userCode,
        roles: ['VOLUNTEER'],
        validAcademicTerm: '2026-2027',
        qrPayload: `SKYLINE-VOLUNTEER:${user?.memberNumber || user?.id}`,
      },
      phase5Roadmap: {
        reimbursements: {
          supported: false,
          status: 'PENDING_PHASE_5',
          message: 'Volunteer expense reimbursement workflows will be introduced in Phase 5.',
        },
        fundraising: {
          supported: false,
          status: 'PENDING_PHASE_5',
          message: 'Association fundraising campaigns will be introduced in Phase 5.',
        },
      },
    };
  }

  /**
   * Get volunteer profile & interests.
   */
  static async getVolunteerProfile(volunteerId) {
    const numId = Number(volunteerId);
    const [user, interest] = await Promise.all([
      User.findOne({ id: numId }).lean(),
      UserInterest.findOne({ userId: numId }).lean(),
    ]);

    if (!user) {
      throw new NotFoundError('Volunteer user not found');
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone || '',
      organizationName: user.organizationName || '',
      city: user.city || '',
      memberNumber: user.memberNumber || null,
      userCode: user.userCode || null,
      roles: Array.isArray(user.roles) ? user.roles : [user.role].filter(Boolean),
      interests: interest?.interests || '',
      skills: interest?.skills || '',
      availability: interest?.availability || 'FLEXIBLE',
      experience: interest?.experience || '',
      department: interest?.department || user.department || '',
    };
  }

  /**
   * Update permitted profile fields. Blocks tampering with roles or points.
   */
  static async updateVolunteerProfile(volunteerId, data) {
    const numId = Number(volunteerId);
    const user = await User.findOne({ id: numId });
    if (!user) {
      throw new NotFoundError('Volunteer user not found');
    }

    // Security check: reject attempts to alter privileged fields
    if (
      data.role !== undefined ||
      data.roles !== undefined ||
      data.memberNumber !== undefined ||
      data.id !== undefined ||
      data.totalXp !== undefined
    ) {
      throw new BadRequestError('Security violation: Attempt to modify privileged or immutable profile attributes');
    }

    if (data.name) user.name = String(data.name).trim();
    if (data.phone !== undefined) user.phone = data.phone ? String(data.phone).trim() : null;
    if (data.organizationName !== undefined) {
      user.organizationName = data.organizationName ? String(data.organizationName).trim() : null;
    }
    if (data.city !== undefined) user.city = data.city ? String(data.city).trim() : null;
    await user.save();

    let interest = await UserInterest.findOne({ userId: numId });
    if (!interest) {
      interest = new UserInterest({ userId: numId, user: user._id });
    }

    if (data.skills !== undefined) interest.skills = data.skills ? String(data.skills).trim() : null;
    if (data.interests !== undefined) interest.interests = data.interests ? String(data.interests).trim() : null;
    if (data.availability !== undefined) interest.availability = data.availability ? String(data.availability).trim() : 'FLEXIBLE';
    if (data.experience !== undefined) interest.experience = data.experience ? String(data.experience).trim() : null;
    if (data.department !== undefined) interest.department = data.department ? String(data.department).trim() : null;
    await interest.save();

    return this.getVolunteerProfile(numId);
  }

  /**
   * Get eligible volunteer opportunities for upcoming published events.
   */
  static async getOpportunities(volunteerId) {
    const numVolunteerId = Number(volunteerId);
    const events = await Event.find({
      status: 'PUBLISHED',
      $or: [
        { eventDate: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        { startDate: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      ],
      volunteerCapacity: { $gt: 0 },
    })
      .select('id title eventName description startDate eventDate endDate location venue volunteerCapacity volunteerCategories organizerId')
      .sort({ startDate: 1, eventDate: 1 })
      .lean();

    const [myApps, allApprovedApps, allTasks] = await Promise.all([
      VolunteerApplication.find({ volunteerId: numVolunteerId }).lean(),
      VolunteerApplication.find({ status: 'APPROVED' }).select('eventId').lean(),
      VolunteerTask.find({}).select('eventId').lean(),
    ]);

    const myAppMap = new Map();
    for (const a of myApps) {
      myAppMap.set(a.eventId, a);
    }

    const approvedCounts = {};
    for (const a of allApprovedApps) {
      approvedCounts[a.eventId] = (approvedCounts[a.eventId] || 0) + 1;
    }

    const taskCounts = {};
    for (const t of allTasks) {
      if (t.eventId) taskCounts[t.eventId] = (taskCounts[t.eventId] || 0) + 1;
    }

    return events.map((ev) => {
      const allocated = Math.max(approvedCounts[ev.id] || 0, taskCounts[ev.id] || 0);
      const capacity = ev.volunteerCapacity || 0;
      const remainingCapacity = Math.max(0, capacity - allocated);
      const myApp = myAppMap.get(ev.id);

      return {
        id: ev.id,
        title: ev.title || ev.eventName,
        description: ev.description || '',
        startDate: ev.startDate,
        endDate: ev.endDate,
        location: ev.location || ev.venue || 'Campus Main Grounds',
        volunteerCapacity: capacity,
        allocatedVolunteers: allocated,
        remainingCapacity,
        volunteerCategories: ev.volunteerCategories || [],
        isOrganizer: ev.organizerId === numVolunteerId,
        myApplication: myApp
          ? {
              id: myApp.id,
              category: myApp.category,
              status: myApp.status,
              createdAt: myApp.createdAt,
            }
          : null,
      };
    });
  }

  /**
   * Volunteer applies for an event opportunity.
   */
  static async applyForOpportunity(volunteerId, eventId, { category = 'GENERAL', notes = '' } = {}) {
    const numVolunteerId = Number(volunteerId);
    const volunteerUser = await User.findOne({ id: numVolunteerId });
    if (!volunteerUser) {
      throw new NotFoundError('Volunteer user not found');
    }

    const volunteerRoles = Array.isArray(volunteerUser.roles) ? volunteerUser.roles : [volunteerUser.role];
    if (!volunteerRoles.includes('VOLUNTEER')) {
      throw new ForbiddenError('Access denied: Only registered VOLUNTEERs can apply for opportunities');
    }

    let eventDoc = null;
    if (typeof eventId === 'string' && /^[0-9a-fA-F]{24}$/.test(eventId)) {
      eventDoc = await Event.findById(eventId);
    } else if (!isNaN(Number(eventId))) {
      eventDoc = await Event.findOne({ id: Number(eventId) });
    }

    if (!eventDoc) {
      throw new NotFoundError('Event not found');
    }

    if (eventDoc.status !== 'PUBLISHED') {
      throw new BadRequestError('Cannot apply to an event that is not PUBLISHED');
    }

    // Prevent organizer self-assignment
    if (eventDoc.organizerId === numVolunteerId || String(eventDoc.organizerId) === String(volunteerId)) {
      throw new ForbiddenError('Organizers cannot apply as volunteers for their own events');
    }

    // Check volunteer capacity configured on event
    const capacity = eventDoc.volunteerCapacity || 0;
    if (capacity <= 0) {
      throw new BadRequestError('This event is not accepting volunteer applications (capacity: 0)');
    }

    // Prevent duplicate applications
    const existingApp = await VolunteerApplication.findOne({
      eventId: eventDoc.id,
      volunteerId: numVolunteerId,
      status: { $in: ['PENDING', 'APPROVED'] },
    });
    if (existingApp) {
      throw new BadRequestError(`You already have an active application (${existingApp.status}) for this event`);
    }

    // Check current allocations vs capacity
    const approvedCount = await VolunteerApplication.countDocuments({
      eventId: eventDoc.id,
      status: 'APPROVED',
    });
    const taskCount = await VolunteerTask.countDocuments({
      eventId: eventDoc.id,
    });
    const allocated = Math.max(approvedCount, taskCount);
    if (allocated >= capacity) {
      throw new BadRequestError(`Event volunteer capacity of ${capacity} has been reached`);
    }

    const app = new VolunteerApplication({
      eventId: eventDoc.id,
      event: eventDoc._id,
      volunteerId: numVolunteerId,
      volunteer: volunteerUser._id,
      category: category ? String(category).trim().toUpperCase() : 'GENERAL',
      notes: notes ? String(notes).trim() : null,
      status: 'PENDING',
    });
    await app.save();

    // Notify organizer
    if (eventDoc.organizerId) {
      await notificationService
        .sendNotification(
          eventDoc.organizerId,
          'ORGANIZER',
          'NEW_VOLUNTEER_APPLICATION',
          'New Volunteer Application',
          `${volunteerUser.name} applied for category ${app.category} on "${eventDoc.title}"`,
          '/organizer/dashboard'
        )
        .catch(() => {});
    }

    await this.recordAudit(
      volunteerId,
      'VOLUNTEER',
      'VOLUNTEER_APPLICATION_SUBMITTED',
      'VOLUNTEER_APPLICATION',
      String(app.id),
      `Volunteer ${numVolunteerId} applied for event ${eventDoc.id}`
    );

    return this.toApplicationResponse(app, eventDoc, volunteerUser);
  }

  /**
   * Get all applications submitted by the current volunteer.
   */
  static async getMyApplications(volunteerId) {
    const numId = Number(volunteerId);
    const apps = await VolunteerApplication.find({ volunteerId: numId })
      .populate('event', 'title eventName startDate endDate location venue status')
      .sort({ createdAt: -1 });

    return apps.map((a) => this.toApplicationResponse(a));
  }

  /**
   * Volunteer withdraws a pending application.
   */
  static async withdrawApplication(volunteerId, applicationId) {
    let app = null;
    if (typeof applicationId === 'string' && /^[0-9a-fA-F]{24}$/.test(applicationId)) {
      app = await VolunteerApplication.findById(applicationId);
    } else if (!isNaN(Number(applicationId))) {
      app = await VolunteerApplication.findOne({ id: Number(applicationId) });
    }

    if (!app) {
      throw new NotFoundError('Volunteer application not found');
    }

    if (app.volunteerId !== Number(volunteerId)) {
      throw new ForbiddenError('Access denied: You do not own this application');
    }

    if (app.status !== 'PENDING') {
      throw new BadRequestError(`Cannot withdraw an application that is already in ${app.status} status`);
    }

    app.status = 'WITHDRAWN';
    await app.save();

    await this.recordAudit(
      volunteerId,
      'VOLUNTEER',
      'VOLUNTEER_APPLICATION_WITHDRAWN',
      'VOLUNTEER_APPLICATION',
      String(app.id),
      `Application ${app.id} withdrawn by volunteer`
    );

    return this.toApplicationResponse(app);
  }

  /**
   * Organizer views applications for their events.
   */
  static async getOrganizerApplications(actorId, { eventId, status } = {}) {
    const numActorId = Number(actorId);
    const myEvents = await Event.find({ $or: [{ organizerId: numActorId }, { organizerId: actorId }] })
      .select('id _id')
      .lean();
    let eventIds = myEvents.map((e) => e.id);

    if (eventId && eventId !== 'ALL') {
      let evDoc = null;
      if (typeof eventId === 'string' && /^[0-9a-fA-F]{24}$/.test(eventId)) {
        evDoc = await Event.findById(eventId);
      } else if (!isNaN(Number(eventId))) {
        evDoc = await Event.findOne({ id: Number(eventId) });
      }
      if (!evDoc || (evDoc.organizerId !== numActorId && String(evDoc.organizerId) !== String(actorId))) {
        throw new ForbiddenError('Unauthorized: You do not own this event');
      }
      eventIds = [evDoc.id];
    }

    const filter = { eventId: { $in: eventIds } };
    if (status && status !== 'ALL') {
      filter.status = String(status).toUpperCase();
    }

    const apps = await VolunteerApplication.find(filter)
      .populate('event', 'title eventName startDate endDate location venue status')
      .populate('volunteer', 'id name email department organizationName memberNumber')
      .sort({ createdAt: -1 });

    return apps.map((a) => this.toApplicationResponse(a));
  }

  /**
   * Organizer reviews and approves or rejects an application.
   */
  static async reviewApplication(actorId, applicationId, { status, reviewNotes = '' } = {}) {
    let app = null;
    if (typeof applicationId === 'string' && /^[0-9a-fA-F]{24}$/.test(applicationId)) {
      app = await VolunteerApplication.findById(applicationId).populate('event');
    } else if (!isNaN(Number(applicationId))) {
      app = await VolunteerApplication.findOne({ id: Number(applicationId) }).populate('event');
    }

    if (!app) {
      throw new NotFoundError('Volunteer application not found');
    }

    const numActorId = Number(actorId);
    if (app.event && app.event.organizerId !== numActorId && String(app.event.organizerId) !== String(actorId)) {
      const actorUser = await User.findOne({ id: numActorId || 0 });
      const isExec =
        actorUser &&
        (actorUser.role === 'ADMIN' || (Array.isArray(actorUser.roles) && actorUser.roles.includes('PRESIDENT')));
      if (!isExec) {
        throw new ForbiddenError('Unauthorized: You do not own this event');
      }
    }

    const targetStatus = String(status).toUpperCase();
    if (!['APPROVED', 'REJECTED'].includes(targetStatus)) {
      throw new BadRequestError('Target review status must be APPROVED or REJECTED');
    }

    if (targetStatus === 'APPROVED' && app.event) {
      const capacity = app.event.volunteerCapacity || 0;
      if (capacity > 0) {
        const approvedCount = await VolunteerApplication.countDocuments({
          eventId: app.event.id,
          status: 'APPROVED',
          _id: { $ne: app._id },
        });
        if (approvedCount >= capacity) {
          throw new BadRequestError(`Cannot approve: Event volunteer capacity of ${capacity} has been reached`);
        }
      }
    }

    app.status = targetStatus;
    app.reviewedBy = numActorId;
    app.reviewedAt = new Date();
    if (reviewNotes) {
      app.reviewNotes = String(reviewNotes).trim();
    }
    await app.save();

    // Notify volunteer
    await notificationService
      .sendNotification(
        app.volunteerId,
        'USER',
        targetStatus === 'APPROVED' ? 'VOLUNTEER_APPLICATION_APPROVED' : 'VOLUNTEER_APPLICATION_REJECTED',
        `Volunteer Application ${targetStatus}`,
        `Your application for "${app.event?.title || 'event'}" has been ${targetStatus.toLowerCase()}`,
        '/volunteer/dashboard'
      )
      .catch(() => {});

    await this.recordAudit(
      actorId,
      'ORGANIZER',
      'VOLUNTEER_APPLICATION_REVIEWED',
      'VOLUNTEER_APPLICATION',
      String(app.id),
      `Application ${app.id} reviewed as ${targetStatus} by actor ${actorId}`
    );

    return this.toApplicationResponse(app);
  }

  /**
   * Smart Rule-Based Matching for Opportunities (40% Interest, 30% Skills, 20% Availability, 10% Experience).
   */
  static async getSmartMatches(volunteerId) {
    const numVolunteerId = Number(volunteerId);
    const [user, interest, attendedCount, completedTasksCount] = await Promise.all([
      User.findOne({ id: numVolunteerId }).lean(),
      UserInterest.findOne({ userId: numVolunteerId }).lean(),
      Booking.countDocuments({ userId: numVolunteerId, attendanceStatus: 'PRESENT' }),
      VolunteerTask.countDocuments({ volunteerId: numVolunteerId, status: 'COMPLETED' }),
    ]);

    if (!user) {
      throw new NotFoundError('Volunteer user not found');
    }

    const userInterests = (interest?.interests || '').toLowerCase();
    const userSkills = (interest?.skills || '').toLowerCase();
    const userAvailability = (interest?.availability || 'FLEXIBLE').toUpperCase();
    const userExperience = (interest?.experience || '').toLowerCase();

    const events = await Event.find({
      status: 'PUBLISHED',
      $or: [
        { eventDate: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        { startDate: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      ],
      volunteerCapacity: { $gt: 0 },
    }).lean();

    const myApplications = await VolunteerApplication.find({
      volunteerId: numVolunteerId,
      status: { $in: ['PENDING', 'APPROVED'] },
    }).lean();
    const appliedEventIds = new Set(myApplications.map((a) => a.eventId));

    const results = [];

    for (const ev of events) {
      // Exclude if already applied or if organizer is current user
      if (appliedEventIds.has(ev.id) || ev.organizerId === numVolunteerId) {
        continue;
      }

      const assignedCount = await VolunteerTask.countDocuments({ eventId: ev.id });
      const approvedApps = await VolunteerApplication.countDocuments({ eventId: ev.id, status: 'APPROVED' });
      const allocated = Math.max(assignedCount, approvedApps);
      const capacity = ev.volunteerCapacity || 0;
      const remainingCapacity = Math.max(0, capacity - allocated);

      if (remainingCapacity <= 0) continue;

      let interestScore = 0;
      let skillsScore = 0;
      let availabilityScore = 0;
      let experienceScore = 0;
      const matchedReasons = [];
      const missingReasons = [];

      // 1. Interest match: 40%
      const evCategory = (ev.category || '').toLowerCase();
      const evTitle = (ev.title || ev.eventName || '').toLowerCase();
      if (
        userInterests &&
        (userInterests.includes(evCategory) ||
          evTitle.includes(userInterests) ||
          userInterests
            .split(',')
            .some((i) => i.trim() && (evTitle.includes(i.trim()) || evCategory.includes(i.trim()))))
      ) {
        interestScore = 40;
        matchedReasons.push(`Event topic aligns with your interests (${interest?.interests})`);
      } else if (evCategory) {
        interestScore = 15;
        missingReasons.push(`Category "${ev.category}" not listed in personal interests`);
      } else {
        missingReasons.push('No interest match detected');
      }

      // 2. Skills match: 30%
      const evVolCats = Array.isArray(ev.volunteerCategories) ? ev.volunteerCategories.map((c) => c.toLowerCase()) : [];
      const skillList = userSkills.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
      const hasSkillMatch = evVolCats.some((cat) => skillList.some((s) => cat.includes(s) || s.includes(cat)));

      if (hasSkillMatch) {
        skillsScore = 30;
        matchedReasons.push('Volunteer role requirements match your listed skills');
      } else if (skillList.length > 0) {
        skillsScore = 10;
        missingReasons.push('Specific volunteer categories require skills not yet in profile');
      } else {
        missingReasons.push('No skills configured in profile');
      }

      // 3. Availability match: 20%
      const evDate = new Date(ev.startDate);
      const dayOfWeek = evDate.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      if (userAvailability === 'FLEXIBLE') {
        availabilityScore = 20;
        matchedReasons.push('Flexible schedule fits event schedule');
      } else if (isWeekend && (userAvailability === 'WEEKENDS' || userAvailability === 'WEEKEND')) {
        availabilityScore = 20;
        matchedReasons.push('Weekend schedule matches your weekend availability');
      } else if (!isWeekend && (userAvailability === 'WEEKDAYS' || userAvailability === 'WEEKDAY')) {
        availabilityScore = 20;
        matchedReasons.push('Weekday schedule matches your weekday availability');
      } else {
        availabilityScore = 5;
        missingReasons.push(
          `Event is on a ${isWeekend ? 'weekend' : 'weekday'} which may conflict with your preferred availability`
        );
      }

      // 4. Verified relevant experience: 10%
      if (completedTasksCount > 0 || attendedCount > 1 || userExperience.length > 5) {
        experienceScore = 10;
        matchedReasons.push(
          `Verified campus contribution history (${completedTasksCount} completed tasks, ${attendedCount} attendances)`
        );
      } else {
        missingReasons.push('Limited prior verified volunteering history on record');
      }

      const totalMatchScore = Math.min(100, interestScore + skillsScore + availabilityScore + experienceScore);

      results.push({
        event: {
          id: ev.id,
          title: ev.title || ev.eventName,
          description: ev.description || '',
          startDate: ev.startDate,
          endDate: ev.endDate,
          location: ev.location || ev.venue || 'Main Campus',
          volunteerCapacity: capacity,
          remainingCapacity,
          volunteerCategories: ev.volunteerCategories || [],
        },
        matchScore: totalMatchScore,
        breakdown: {
          interestMatch: interestScore,
          skillsMatch: skillsScore,
          availabilityMatch: availabilityScore,
          experienceMatch: experienceScore,
        },
        matchedReasons,
        missingReasons,
        disclaimer:
          'Informational match score based on transparent weights (40% Interest, 30% Skills, 20% Availability, 10% Experience). Does not automatically assign or bypass approval.',
      });
    }

    results.sort((a, b) => b.matchScore - a.matchScore);
    return results;
  }

  /**
   * Get volunteer verified contributions, attendance & points breakdown.
   */
  static async getContributions(volunteerId) {
    const numId = Number(volunteerId);
    const [level, completedTasks, attendedBookings, achievements] = await Promise.all([
      GamificationService.getOrCreateLevel(numId),
      VolunteerTask.find({ volunteerId: numId, status: 'COMPLETED' })
        .populate('event', 'title eventName startDate location venue')
        .sort({ completedAt: -1 }),
      Booking.find({ userId: numId, attendanceStatus: 'PRESENT' })
        .populate('event', 'title eventName startDate eventDate location venue')
        .sort({ bookedAt: -1 }),
      UserAchievement.find({ userId: numId }).sort({ earnedAt: -1 }).lean(),
    ]);

    const taskPoints = completedTasks.reduce((acc, t) => acc + (t.pointsAwarded || 50), 0);
    const attendancePoints = attendedBookings.length * 25;
    const badgesBonus = achievements.reduce((acc, a) => acc + (a.xpAwarded || 20), 0);
    const officialTotalPoints = level.totalXp || taskPoints + attendancePoints + badgesBonus;

    return {
      volunteerId: numId,
      totalPoints: officialTotalPoints,
      currentLevel: level.currentLevel,
      pointsBreakdown: {
        taskVerificationPoints: taskPoints,
        attendancePoints,
        badgesBonus,
        officialScore: officialTotalPoints,
      },
      completedTasks: completedTasks.map((t) => this.toTaskResponse(t)),
      verifiedAttendance: attendedBookings.map((b) => ({
        bookingId: b.id,
        eventName: b.event?.title || b.event?.eventName || 'Campus Event',
        eventDate: b.event?.startDate || b.event?.eventDate,
        venue: b.event?.location || b.event?.venue,
        checkInTime: b.attendanceTimestamp || b.updatedAt,
        ticketId: b.ticketId,
      })),
      badges: achievements,
    };
  }

  /**
   * Safe Digital ID information & verification QR payload.
   */
  static async getDigitalId(volunteerId) {
    const numId = Number(volunteerId);
    const user = await User.findOne({ id: numId }).lean();
    if (!user) {
      throw new NotFoundError('Volunteer user not found');
    }

    // Safe public identifier only - never expose JWT or secret tokens
    const publicIdentifier = user.memberNumber || user.userCode || `VOL-${String(user.id).padStart(4, '0')}`;
    const qrPayload = `SKYLINE-VOLUNTEER:${publicIdentifier}`;

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      memberNumber: user.memberNumber || null,
      userCode: user.userCode || null,
      roles: Array.isArray(user.roles) ? user.roles : [user.role].filter(Boolean),
      department: user.department || user.organizationName || 'Student Volunteer',
      validAcademicTerm: '2026-2027',
      qrPayload,
      issuedBy: 'Skyline Student Association',
    };
  }

  /**
   * Helper to format task response.
   */
  static toTaskResponse(t) {
    if (!t) return null;
    const doc = t.toObject ? t.toObject() : t;
    return {
      id: doc.id,
      title: doc.title,
      description: doc.description || '',
      eventId: doc.eventId || null,
      event: doc.event
        ? {
            id: doc.event.id || doc.eventId,
            title: doc.event.title || doc.event.eventName || 'Event',
            startDate: doc.event.startDate,
            endDate: doc.event.endDate,
            location: doc.event.location || doc.event.venue,
            status: doc.event.status,
          }
        : null,
      volunteerId: doc.volunteerId,
      volunteer:
        doc.volunteer && typeof doc.volunteer === 'object'
          ? {
              id: doc.volunteer.id || doc.volunteerId,
              name: doc.volunteer.name || '',
              email: doc.volunteer.email || '',
              department: doc.volunteer.department || '',
              memberNumber: doc.volunteer.memberNumber || null,
            }
          : null,
      assignedBy: doc.assignedBy,
      status: doc.status,
      priority: doc.priority,
      dueDate: doc.dueDate || null,
      completedAt: doc.completedAt || null,
      completionNotes: doc.completionNotes || null,
      evidenceUrl: doc.evidenceUrl || null,
      evidenceNotes: doc.evidenceNotes || null,
      pointsAwarded: doc.pointsAwarded || 0,
      verifiedBy: doc.verifiedBy || null,
      verifiedAt: doc.verifiedAt || null,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  /**
   * Helper to format application response.
   */
  static toApplicationResponse(appDoc, eventDoc = null, volunteerDoc = null) {
    if (!appDoc) return null;
    const doc = appDoc.toObject ? appDoc.toObject() : appDoc;
    return {
      id: doc.id,
      eventId: doc.eventId,
      event:
        doc.event && typeof doc.event === 'object'
          ? {
              id: doc.event.id || doc.eventId,
              title: doc.event.title || doc.event.eventName || 'Event',
              startDate: doc.event.startDate,
              endDate: doc.event.endDate,
              location: doc.event.location || doc.event.venue,
              status: doc.event.status,
            }
          : eventDoc
          ? {
              id: eventDoc.id,
              title: eventDoc.title || eventDoc.eventName || 'Event',
              startDate: eventDoc.startDate,
              endDate: eventDoc.endDate,
              location: eventDoc.location || eventDoc.venue,
              status: eventDoc.status,
            }
          : null,
      volunteerId: doc.volunteerId,
      volunteer:
        doc.volunteer && typeof doc.volunteer === 'object'
          ? {
              id: doc.volunteer.id || doc.volunteerId,
              name: doc.volunteer.name || '',
              email: doc.volunteer.email || '',
              memberNumber: doc.volunteer.memberNumber || null,
            }
          : volunteerDoc
          ? {
              id: volunteerDoc.id,
              name: volunteerDoc.name || '',
              email: volunteerDoc.email || '',
              memberNumber: volunteerDoc.memberNumber || null,
            }
          : null,
      category: doc.category,
      status: doc.status,
      notes: doc.notes || '',
      reviewedBy: doc.reviewedBy || null,
      reviewedAt: doc.reviewedAt || null,
      reviewNotes: doc.reviewNotes || null,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  static async recordAudit(actorId, actorType, action, targetType, targetId, details) {
    try {
      await AuditLog.create({
        actorId,
        actorType,
        action,
        targetType,
        targetId,
        details,
        createdAt: new Date(),
      });
    } catch (err) {
      logger.warn({ err }, '[VolunteerService] Audit log write failed');
    }
  }
}

export default VolunteerService;
