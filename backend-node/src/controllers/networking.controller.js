import { NetworkingService } from '../services/networking.service.js';
import { ApiResponse } from '../utils/apiResponse.js';

export class NetworkingController {
  static async suggestions(req, res) {
    const suggestions = await NetworkingService.suggestConnections(req.user.id);
    return ApiResponse.success(res, suggestions);
  }

  static async connect(req, res) {
    const { receiverId } = req.params;
    const result = await NetworkingService.sendConnectionRequest(req.user.id, receiverId);
    return ApiResponse.success(res, result);
  }

  static async respond(req, res) {
    const { connectionId } = req.params;
    const { status } = req.query;
    const result = await NetworkingService.respondToConnection(connectionId, req.user.id, status);
    return ApiResponse.success(res, result);
  }

  static async myConnections(req, res) {
    const connections = await NetworkingService.getMyConnections(req.user.id);
    return ApiResponse.success(res, connections);
  }

  static async pending(req, res) {
    const pending = await NetworkingService.getPendingRequests(req.user.id);
    return ApiResponse.success(res, pending);
  }
}

export default NetworkingController;
