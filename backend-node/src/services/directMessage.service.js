import { DirectMessage, User } from '../models/index.js';
import { NotFoundError, ForbiddenError, BadRequestError } from '../utils/errors.js';
import { realtimeBroker } from '../sockets/realtimeBroker.js';

export class DirectMessageService {
  /**
   * Send a direct message.
   */
  async send(senderId, receiverId, content, messageType = 'TEXT', voiceUrl = null, voiceDurationSeconds = 0, attachmentUrl = null) {
    const numSenderId = Number(senderId);
    const numReceiverId = Number(receiverId);

    if (numSenderId === numReceiverId) {
      throw new BadRequestError('Cannot send a message to yourself');
    }

    const text = content ? String(content).trim() : '';
    if (!text && !voiceUrl && !attachmentUrl) {
      throw new BadRequestError('Message content or media attachment is required');
    }

    const created = await DirectMessage.create({
      senderId: numSenderId,
      receiverId: numReceiverId,
      content: text,
      messageType,
      voiceUrl,
      voiceDurationSeconds: Number(voiceDurationSeconds) || 0,
      attachmentUrl,
      read: false,
      sentAt: new Date(),
    });

    const serialized = this.serialize(created);
    realtimeBroker.broadcastDirectMessage('created', serialized);
    return serialized;
  }

  /**
   * Retrieve conversation history between two users and mark received messages as read.
   */
  async getConversation(userId, otherId) {
    const u = Number(userId);
    const o = Number(otherId);

    const messages = await DirectMessage.find({
      $or: [
        { senderId: u, receiverId: o, deletedForSender: false, deletedForEveryone: false },
        { senderId: o, receiverId: u, deletedForReceiver: false, deletedForEveryone: false },
      ],
    }).sort({ sentAt: 1, id: 1 });

    // Mark unread messages from other user as read
    await DirectMessage.updateMany(
      { senderId: o, receiverId: u, read: false },
      { $set: { read: true } }
    );

    return messages.map(m => this.serialize(m));
  }

  /**
   * Poll for messages newer than lastId.
   */
  async poll(userId, otherId, lastId = 0) {
    const u = Number(userId);
    const o = Number(otherId);
    const numLastId = Number(lastId) || 0;

    const messages = await DirectMessage.find({
      id: { $gt: numLastId },
      $or: [
        { senderId: u, receiverId: o, deletedForSender: false, deletedForEveryone: false },
        { senderId: o, receiverId: u, deletedForReceiver: false, deletedForEveryone: false },
      ],
    }).sort({ id: 1 });

    return messages.map(m => this.serialize(m));
  }

  /**
   * Count unread messages for a user.
   */
  async unreadCount(userId) {
    const u = Number(userId);
    return DirectMessage.countDocuments({
      receiverId: u,
      read: false,
      deletedForReceiver: false,
      deletedForEveryone: false,
    });
  }

  /**
   * Edit a direct message.
   */
  async edit(userId, messageId, content) {
    const u = Number(userId);
    const msg = await DirectMessage.findOne({ id: Number(messageId) });
    if (!msg) {
      throw new NotFoundError('Message not found');
    }
    if (Number(msg.senderId) !== u) {
      throw new ForbiddenError('Only the sender can edit this message');
    }

    const text = String(content || '').trim();
    if (!text) {
      throw new BadRequestError('Content cannot be empty');
    }

    msg.content = text;
    msg.edited = true;
    msg.editedAt = new Date();
    await msg.save();

    const serialized = this.serialize(msg);
    realtimeBroker.broadcastDirectMessage('updated', serialized);
    return serialized;
  }

  /**
   * Delete message for current user only.
   */
  async deleteForMe(userId, messageId) {
    const u = Number(userId);
    const msg = await DirectMessage.findOne({ id: Number(messageId) });
    if (!msg) {
      throw new NotFoundError('Message not found');
    }

    if (Number(msg.senderId) === u) {
      msg.deletedForSender = true;
    } else if (Number(msg.receiverId) === u) {
      msg.deletedForReceiver = true;
    } else {
      throw new ForbiddenError('Not a participant in this conversation');
    }

    await msg.save();
    const serialized = this.serialize(msg);
    realtimeBroker.broadcastDirectMessageDeletedForMe(u, serialized);
    return serialized;
  }

  /**
   * Unsend message for everyone.
   */
  async unsend(userId, messageId) {
    const u = Number(userId);
    const msg = await DirectMessage.findOne({ id: Number(messageId) });
    if (!msg) {
      throw new NotFoundError('Message not found');
    }
    if (Number(msg.senderId) !== u) {
      throw new ForbiddenError('Only the sender can unsend this message');
    }

    msg.deletedForEveryone = true;
    msg.deletedAt = new Date();
    msg.content = 'This message was unsent';
    await msg.save();

    const serialized = this.serialize(msg);
    realtimeBroker.broadcastDirectMessage('updated', serialized);
    return serialized;
  }

  /**
   * Format message matching Spring Boot response.
   */
  serialize(doc) {
    if (!doc) return null;
    const obj = doc.toObject ? doc.toObject() : doc;
    return {
      id: obj.id,
      senderId: obj.senderId,
      receiverId: obj.receiverId,
      content: obj.content,
      messageType: obj.messageType,
      voiceUrl: obj.voiceUrl,
      voiceDurationSeconds: obj.voiceDurationSeconds,
      attachmentUrl: obj.attachmentUrl,
      read: Boolean(obj.read),
      edited: Boolean(obj.edited),
      deletedForSender: Boolean(obj.deletedForSender),
      deletedForReceiver: Boolean(obj.deletedForReceiver),
      deletedForEveryone: Boolean(obj.deletedForEveryone),
      sentAt: obj.sentAt ? new Date(obj.sentAt).toISOString() : new Date().toISOString(),
      editedAt: obj.editedAt ? new Date(obj.editedAt).toISOString() : null,
      deletedAt: obj.deletedAt ? new Date(obj.deletedAt).toISOString() : null,
    };
  }
}

export const directMessageService = new DirectMessageService();
export default directMessageService;
