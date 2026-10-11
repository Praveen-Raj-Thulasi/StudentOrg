import { Membership, OrganizationAnnouncement, User, Notification } from '../models/index.js';
import { BadRequestError } from '../utils/errors.js';
import { realtimeBroker } from '../sockets/realtimeBroker.js';
import { emailService } from './email.service.js';

export class OrganizationAnnouncementService {
  static async publish(authorId, { title, message }) {
    const cleanTitle = String(title || '').trim();
    const cleanMessage = String(message || '').trim();
    if (!cleanTitle || cleanTitle.length > 160) {
      throw new BadRequestError('Title is required and must be at most 160 characters');
    }
    if (!cleanMessage || cleanMessage.length > 5000) {
      throw new BadRequestError('Message is required and must be at most 5000 characters');
    }

    const announcement = await OrganizationAnnouncement.create({
      title: cleanTitle,
      message: cleanMessage,
      authorId: Number(authorId),
      publishedAt: new Date(),
    });

    const activeMemberships = await Membership.find({
      status: 'ACTIVE',
      $or: [{ validUntil: null }, { validUntil: { $gt: new Date() } }],
    }).select('userId').lean();
    const userIds = [...new Set(activeMemberships.map((membership) => Number(membership.userId)).filter(Number.isFinite))];
    const users = await User.find({ id: { $in: userIds }, accountLocked: { $ne: true } }).select('id name email').lean();
    const recipients = users.map((user) => Number(user.id));

    // Store one inbox item per recipient so announcements remain available when members return later.
    const notifications = recipients.map((recipientId) => ({
      recipientId,
      recipientType: 'USER',
      notificationType: 'ORGANIZATION_ANNOUNCEMENT',
      title: cleanTitle,
      message: cleanMessage,
      actionUrl: '/notifications',
      read: false,
      createdAt: announcement.publishedAt,
    }));
    if (notifications.length) await Notification.insertMany(notifications, { ordered: false });

    announcement.recipientCount = recipients.length;
    let emailRecipientCount = 0;
    const emailUsers = users.filter((user) => user.email);
    for (let i = 0; i < emailUsers.length; i += 10) {
      const results = await Promise.all(emailUsers.slice(i, i + 10).map((user) => emailService.sendMail({
        to: user.email,
        subject: cleanTitle,
        text: `Hello ${user.name || 'member'},\n\n${cleanMessage}\n\nSkyline Student Association`,
        emailType: 'ORGANIZATION_ANNOUNCEMENT',
      })));
      emailRecipientCount += results.filter(Boolean).length;
    }
    announcement.emailRecipientCount = emailRecipientCount;
    await announcement.save();

    // Best-effort live delivery. Persisted notifications remain available if a socket is offline.
    for (const recipientId of recipients) {
      try {
        realtimeBroker.broadcastNotification(recipientId, 'USER', {
          notificationType: 'ORGANIZATION_ANNOUNCEMENT',
          title: cleanTitle,
          message: cleanMessage,
          actionUrl: '/notifications',
          read: false,
          createdAt: announcement.publishedAt,
        });
      } catch { /* offline users can read the persisted inbox item later */ }
    }

    return announcement;
  }

  static async list({ limit = 50 } = {}) {
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 50));
    return OrganizationAnnouncement.find().sort({ publishedAt: -1 }).limit(safeLimit).lean();
  }
}

export default OrganizationAnnouncementService;
