import mongoose from 'mongoose';
import { EventCommunityMessage, Event, Booking, User, Organizer } from '../models/index.js';
import { NotFoundError, ForbiddenError, BadRequestError } from '../utils/errors.js';
import { notificationService } from './notification.service.js';
import { realtimeBroker } from '../sockets/realtimeBroker.js';
import { logger } from '../utils/logger.js';

export class CommunityChatService {
  constructor() {
    this.manuallyClosedEvents = new Map();
    this.mutedMembers = new Map();
  }

  /**
   * Helper to load event by numeric ID or ObjectId.
   */
  async loadEvent(eventId) {
    let event = null;
    const num = Number(eventId);
    if (!isNaN(num) && num > 0) {
      event = await Event.findOne({ id: num }).populate('organizer');
    }
    if (!event && typeof eventId === 'string' && /^[0-9a-fA-F]{24}$/.test(eventId)) {
      event = await Event.findById(eventId).populate('organizer');
    }
    if (!event) {
      throw new NotFoundError(`Event not found with ID ${eventId}`);
    }
    return event;
  }

  /**
   * Check if a principal is an organizer who owns the event.
   */
  isOrganizer(event, principal) {
    if (!principal || !event) return false;
    const role = (principal.role || '').toUpperCase();
    if (role !== 'ORGANIZER') return false;

    const organizerId = event.organizerId || (event.organizer && typeof event.organizer.id === 'number' ? event.organizer.id : null);
    return Number(organizerId) === Number(principal.id);
  }

  /**
   * Check if principal is a moderator (event organizer or platform admin).
   */
  isModerator(event, principal) {
    if (!principal) return false;
    const role = (principal.role || '').toUpperCase();
    if (role === 'ADMIN') return true;
    return this.isOrganizer(event, principal);
  }

  /**
   * Check if event has ended.
   */
  isEnded(event) {
    if (!event) return false;
    if (['COMPLETED', 'EXPIRED'].includes(event.status)) return true;

    if (event.eventDate) {
      const now = new Date();
      const eventDate = new Date(event.eventDate);
      // If endDate is provided, check endDate, else eventDate
      if (event.endDate) {
        const endDate = new Date(event.endDate);
        if (now > endDate) return true;
      } else if (now.getTime() - eventDate.getTime() > 24 * 60 * 60 * 1000) {
        return true;
      }
    }
    return false;
  }

  /**
   * Determine read-only reason if user is blocked from posting.
   */
  async readOnlyReason(event, principal) {
    const numEventId = Number(event.id);
    if (this.manuallyClosedEvents.get(numEventId)) {
      return 'Community chat is closed by the organizer';
    }

    const muteKey = `${numEventId}:${principal.id}:${(principal.role || 'USER').toUpperCase()}`;
    const mutedUntil = this.mutedMembers.get(muteKey);
    if (mutedUntil && mutedUntil > Date.now()) {
      return 'You are temporarily muted';
    }

    if (this.isEnded(event)) {
      return 'Community chat is read-only after the event ends';
    }

    if (this.isModerator(event, principal)) {
      return null;
    }

    const role = (principal.role || '').toUpperCase();
    if (role === 'USER') {
      const booking = await Booking.findOne({
        eventId: numEventId,
        userId: Number(principal.id),
        bookingStatus: 'CONFIRMED',
      });
      if (!booking) {
        return 'Register for this event to join the community discussion';
      }
      return null;
    }

    return 'Community chat is not available';
  }

  /**
   * Check if user is authorized to view the community chat.
   */
  async canView(eventOrId, principal) {
    if (!principal) return false;
    const role = (principal.role || '').toUpperCase();
    if (role === 'ADMIN') return true;

    const event = eventOrId.id !== undefined ? eventOrId : await this.loadEvent(eventOrId);
    if (this.isOrganizer(event, principal)) return true;

    if (role === 'USER') {
      const booking = await Booking.findOne({
        eventId: Number(event.id),
        userId: Number(principal.id),
        bookingStatus: 'CONFIRMED',
      });
      return Boolean(booking);
    }

    return false;
  }

  /**
   * Check if user is authorized to send a message.
   */
  async canSend(event, principal) {
    const allowed = await this.canView(event, principal);
    if (!allowed) return false;
    const reason = await this.readOnlyReason(event, principal);
    return reason === null;
  }

  /**
   * Get community chat context (settings, permissions, pinned messages).
   */
  async context(eventId, principal) {
    const event = await this.loadEvent(eventId);
    const authorized = await this.canView(event, principal);
    if (!authorized) {
      throw new ForbiddenError('Only booked attendees, the organizer, or admins can access this community');
    }

    const sendAllowed = await this.canSend(event, principal);
    const reason = await this.readOnlyReason(event, principal);
    const moderator = this.isModerator(event, principal);

    const pinnedMessages = await EventCommunityMessage.find({
      eventId: Number(event.id),
      pinned: true,
      deleted: false,
    }).sort({ sentAt: -1 });

    return {
      eventId: Number(event.id),
      groupName: `${event.eventName} Community`,
      canSend: sendAllowed,
      readOnlyReason: reason,
      moderator,
      pinnedMessages: pinnedMessages.map(m => this.serialize(m)),
    };
  }

  /**
   * Get latest messages with limit.
   */
  async latest(eventId, limit = 50, principal) {
    const event = await this.loadEvent(eventId);
    const authorized = await this.canView(event, principal);
    if (!authorized) {
      throw new ForbiddenError('Only booked attendees, the organizer, or admins can access this community');
    }

    const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 100));
    const messages = await EventCommunityMessage.find({ eventId: Number(event.id) })
      .sort({ sentAt: -1, id: -1 })
      .limit(safeLimit);

    return messages.reverse().map(m => this.serialize(m));
  }

  /**
   * Long-poll for messages newer than afterId.
   */
  async newerThan(eventId, afterId = 0, principal) {
    const event = await this.loadEvent(eventId);
    const authorized = await this.canView(event, principal);
    if (!authorized) {
      throw new ForbiddenError('Only booked attendees, the organizer, or admins can access this community');
    }

    const numAfterId = Number(afterId) || 0;
    const messages = await EventCommunityMessage.find({
      eventId: Number(event.id),
      id: { $gt: numAfterId },
    }).sort({ id: 1 }).limit(50);

    return messages.map(m => this.serialize(m));
  }

  /**
   * Fetch older messages before beforeId (pagination history).
   */
  async olderThan(eventId, beforeId, principal) {
    const event = await this.loadEvent(eventId);
    const authorized = await this.canView(event, principal);
    if (!authorized) {
      throw new ForbiddenError('Only booked attendees, the organizer, or admins can access this community');
    }

    const numBeforeId = Number(beforeId) || Number.MAX_SAFE_INTEGER;
    const messages = await EventCommunityMessage.find({
      eventId: Number(event.id),
      id: { $lt: numBeforeId },
    }).sort({ sentAt: -1, id: -1 }).limit(50);

    return messages.reverse().map(m => this.serialize(m));
  }

  /**
   * Send a new community message.
   */
  async send(eventId, principal, rawMessage, rawMessageType = 'TEXT', attachmentUrl = null, announcement = false, pin = false) {
    const event = await this.loadEvent(eventId);
    const allowed = await this.canSend(event, principal);
    if (!allowed) {
      const reason = await this.readOnlyReason(event, principal);
      throw new ForbiddenError(reason || 'Unauthorized to post in community chat');
    }

    const messageText = rawMessage ? String(rawMessage).trim() : '';
    if (!messageText && !attachmentUrl) {
      throw new BadRequestError('Message or attachment is required');
    }
    if (messageText.length > 2000) {
      throw new BadRequestError('Message cannot exceed 2000 characters');
    }

    const moderator = this.isModerator(event, principal);
    let senderName = principal.name || principal.email;
    if (!senderName) {
      if (principal.role === 'ORGANIZER') {
        const org = await Organizer.findOne({ id: Number(principal.id) });
        senderName = org?.organizationName || 'Organizer';
      } else {
        const u = await User.findOne({ id: Number(principal.id) });
        senderName = u?.name || 'Participant';
      }
    }

    const moderationStatus = this.moderate(messageText);

    const created = await EventCommunityMessage.create({
      eventId: Number(event.id),
      event: event._id,
      senderId: Number(principal.id),
      senderRole: (principal.role || 'USER').toUpperCase(),
      senderName,
      messageType: rawMessageType || (attachmentUrl ? 'FILE' : 'TEXT'),
      message: messageText,
      content: messageText,
      attachmentUrl,
      announcement: moderator && Boolean(announcement),
      pinned: moderator && Boolean(pin),
      moderationStatus,
      sentAt: new Date(),
    });

    const serialized = this.serialize(created);

    // Broadcast to room
    realtimeBroker.broadcastCommunityMessage(event.id, 'created', serialized);

    // Notify registered participants if pinned or announcement
    if (created.pinned || created.announcement) {
      this.notifyParticipants(event, created).catch(err => {
        logger.warn({ err }, 'Failed to send participant notifications for community announcement');
      });
    }

    return serialized;
  }

  /**
   * Edit an existing message.
   */
  async edit(eventId, messageId, principal, newContent) {
    const event = await this.loadEvent(eventId);
    const msg = await EventCommunityMessage.findOne({
      id: Number(messageId),
      eventId: Number(event.id),
    });
    if (!msg) {
      throw new NotFoundError('Message not found');
    }

    // Only sender can edit
    if (Number(msg.senderId) !== Number(principal.id) || msg.senderRole !== (principal.role || '').toUpperCase()) {
      throw new ForbiddenError('Only the original sender can edit this message');
    }

    const text = String(newContent || '').trim();
    if (!text || text.length > 2000) {
      throw new BadRequestError('Edited message must be 1-2000 characters');
    }

    msg.message = text;
    msg.content = text;
    msg.edited = true;
    msg.editedAt = new Date();
    await msg.save();

    const serialized = this.serialize(msg);
    realtimeBroker.broadcastCommunityMessage(event.id, 'updated', serialized);
    return serialized;
  }

  /**
   * Delete an existing message (soft delete).
   */
  async delete(eventId, messageId, principal) {
    const event = await this.loadEvent(eventId);
    const msg = await EventCommunityMessage.findOne({
      id: Number(messageId),
      eventId: Number(event.id),
    });
    if (!msg) {
      throw new NotFoundError('Message not found');
    }

    const isOwner = Number(msg.senderId) === Number(principal.id) && msg.senderRole === (principal.role || '').toUpperCase();
    const isMod = this.isModerator(event, principal);

    if (!isOwner && !isMod) {
      throw new ForbiddenError('Only the sender, organizer, or admin can delete this message');
    }

    msg.deleted = true;
    msg.deletedAt = new Date();
    msg.message = 'This message was deleted';
    msg.content = 'This message was deleted';
    msg.attachmentUrl = null;
    await msg.save();

    const serialized = this.serialize(msg);
    realtimeBroker.broadcastCommunityMessage(event.id, 'updated', serialized);
    return serialized;
  }

  /**
   * Pin or unpin a message.
   */
  async pin(eventId, messageId, principal, pinned = true) {
    const event = await this.loadEvent(eventId);
    if (!this.isModerator(event, principal)) {
      throw new ForbiddenError('Only organizers or admins can pin messages');
    }

    const msg = await EventCommunityMessage.findOne({
      id: Number(messageId),
      eventId: Number(event.id),
    });
    if (!msg) {
      throw new NotFoundError('Message not found');
    }

    msg.pinned = Boolean(pinned);
    await msg.save();

    const serialized = this.serialize(msg);
    realtimeBroker.broadcastCommunityMessage(event.id, 'updated', serialized);

    if (msg.pinned) {
      this.notifyParticipants(event, msg, 'COMMUNITY_PINNED').catch(() => {});
    }

    return serialized;
  }

  /**
   * Manually open or close community chat.
   */
  async closeChat(eventId, principal, closed = true) {
    const event = await this.loadEvent(eventId);
    if (!this.isModerator(event, principal)) {
      throw new ForbiddenError('Only organizers or admins can close chat');
    }

    this.manuallyClosedEvents.set(Number(event.id), Boolean(closed));
  }

  /**
   * Mute a participant in the event community.
   */
  async mute(eventId, senderId, senderRole = 'USER', minutes = 30, principal) {
    const event = await this.loadEvent(eventId);
    if (!this.isModerator(event, principal)) {
      throw new ForbiddenError('Only organizers or admins can mute members');
    }

    const duration = Math.max(1, Math.min(Number(minutes) || 30, 1440));
    const muteKey = `${Number(event.id)}:${Number(senderId)}:${senderRole.toUpperCase()}`;
    this.mutedMembers.set(muteKey, Date.now() + duration * 60 * 1000);
  }

  /**
   * Content moderation filter.
   */
  moderate(content) {
    const text = (content || '').toLowerCase();
    if (text.includes('http://') || text.includes('bit.ly') || text.includes('free money')) {
      return 'REVIEW';
    }
    return 'CLEAN';
  }

  /**
   * Notify confirmed participants about important community events.
   */
  async notifyParticipants(event, messageDoc, notifType = 'COMMUNITY_ANNOUNCEMENT') {
    const bookings = await Booking.find({
      eventId: Number(event.id),
      bookingStatus: 'CONFIRMED',
    }).select('userId');

    const title = notifType === 'COMMUNITY_PINNED' ? 'Pinned Announcement' : 'New Event Announcement';
    const message = `${event.eventName}: ${messageDoc.message.slice(0, 100)}`;
    const actionUrl = `/events/${event.id}`;

    for (const b of bookings) {
      if (Number(b.userId) !== Number(messageDoc.senderId)) {
        await notificationService.sendNotification(b.userId, 'USER', notifType, title, message, actionUrl);
      }
    }
  }

  /**
   * Serialization helper matching Spring Boot DTO response.
   */
  serialize(doc) {
    if (!doc) return null;
    const obj = doc.toObject ? doc.toObject() : doc;
    return {
      id: obj.id,
      eventId: obj.eventId,
      senderId: obj.senderId,
      senderRole: obj.senderRole,
      senderName: obj.senderName,
      messageType: obj.messageType,
      message: obj.message,
      content: obj.content || obj.message,
      attachmentUrl: obj.attachmentUrl,
      pinned: Boolean(obj.pinned),
      announcement: Boolean(obj.announcement),
      edited: Boolean(obj.edited),
      deleted: Boolean(obj.deleted),
      moderationStatus: obj.moderationStatus,
      sentAt: obj.sentAt ? new Date(obj.sentAt).toISOString() : new Date().toISOString(),
      editedAt: obj.editedAt ? new Date(obj.editedAt).toISOString() : null,
      deletedAt: obj.deletedAt ? new Date(obj.deletedAt).toISOString() : null,
    };
  }
}

export const communityChatService = new CommunityChatService();
export default communityChatService;
