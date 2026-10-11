import { communityChatService } from '../services/communityChat.service.js';
import { ApiResponse } from '../utils/apiResponse.js';

export class CommunityChatController {
  static async context(req, res) {
    const data = await communityChatService.context(req.params.eventId, req.user);
    return ApiResponse.success(res, data);
  }

  static async messages(req, res) {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;
    const data = await communityChatService.latest(req.params.eventId, limit, req.user);
    return ApiResponse.success(res, data);
  }

  static async poll(req, res) {
    const afterId = req.query.afterId ? Number(req.query.afterId) : 0;
    const data = await communityChatService.newerThan(req.params.eventId, afterId, req.user);
    return ApiResponse.success(res, data);
  }

  static async older(req, res) {
    const beforeId = req.query.beforeId ? Number(req.query.beforeId) : null;
    const data = await communityChatService.olderThan(req.params.eventId, beforeId, req.user);
    return ApiResponse.success(res, data);
  }

  static async send(req, res) {
    const body = req.body || {};
    const message = body.message || body.content || '';
    const messageType = body.messageType || 'TEXT';
    const attachmentUrl = body.attachmentUrl || null;
    const announcement = Boolean(body.announcement);
    const pin = Boolean(body.pinned || body.pin);

    const saved = await communityChatService.send(
      req.params.eventId,
      req.user,
      message,
      messageType,
      attachmentUrl,
      announcement,
      pin
    );
    return ApiResponse.success(res, saved);
  }

  static async edit(req, res) {
    const body = req.body || {};
    const message = body.message || body.content || '';
    const saved = await communityChatService.edit(
      req.params.eventId,
      req.params.messageId,
      req.user,
      message
    );
    return ApiResponse.success(res, saved);
  }

  static async delete(req, res) {
    const saved = await communityChatService.delete(
      req.params.eventId,
      req.params.messageId,
      req.user
    );
    return ApiResponse.success(res, saved);
  }

  static async pin(req, res) {
    const pinned = req.query.pinned !== undefined ? req.query.pinned === 'true' || req.query.pinned === true : true;
    const saved = await communityChatService.pin(
      req.params.eventId,
      req.params.messageId,
      req.user,
      pinned
    );
    return ApiResponse.success(res, saved);
  }

  static async close(req, res) {
    const closed = req.query.closed !== undefined ? req.query.closed === 'true' || req.query.closed === true : true;
    await communityChatService.closeChat(req.params.eventId, req.user, closed);
    return ApiResponse.success(res, null);
  }

  static async mute(req, res) {
    const body = req.body || {};
    const senderId = body.senderId;
    const senderRole = body.senderRole || 'USER';
    const minutes = body.minutes ? parseInt(body.minutes, 10) : 30;

    await communityChatService.mute(req.params.eventId, senderId, senderRole, minutes, req.user);
    return ApiResponse.success(res, null);
  }
}

export default CommunityChatController;
