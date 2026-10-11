import { directMessageService } from '../services/directMessage.service.js';
import { ApiResponse } from '../utils/apiResponse.js';

export class DirectMessageController {
  static async send(req, res) {
    const { receiverId } = req.params;
    const { content, messageType, voiceUrl, voiceDurationSeconds, attachmentUrl } = req.body || {};
    const saved = await directMessageService.send(
      req.user.id,
      receiverId,
      content,
      messageType,
      voiceUrl,
      voiceDurationSeconds,
      attachmentUrl
    );
    return ApiResponse.success(res, saved);
  }

  static async conversation(req, res) {
    const { otherId } = req.params;
    const messages = await directMessageService.getConversation(req.user.id, otherId);
    return ApiResponse.success(res, messages);
  }

  static async poll(req, res) {
    const { otherId } = req.params;
    const lastId = req.query.lastId ? Number(req.query.lastId) : 0;
    const messages = await directMessageService.poll(req.user.id, otherId, lastId);
    return ApiResponse.success(res, messages);
  }

  static async unread(req, res) {
    const count = await directMessageService.unreadCount(req.user.id);
    return ApiResponse.success(res, { unread: count });
  }

  static async edit(req, res) {
    const { messageId } = req.params;
    const { content } = req.body || {};
    const saved = await directMessageService.edit(req.user.id, messageId, content);
    return ApiResponse.success(res, saved);
  }

  static async deleteForMe(req, res) {
    const { messageId } = req.params;
    const saved = await directMessageService.deleteForMe(req.user.id, messageId);
    return ApiResponse.success(res, saved);
  }

  static async unsend(req, res) {
    const { messageId } = req.params;
    const saved = await directMessageService.unsend(req.user.id, messageId);
    return ApiResponse.success(res, saved);
  }
}

export default DirectMessageController;
