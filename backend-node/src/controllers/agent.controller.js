import { eventGptToolService } from '../ai/tools/eventGptToolService.js';
import { ApiResponse } from '../utils/apiResponse.js';

export class AgentController {
  tools(req, res) {
    const list = eventGptToolService.availableTools();
    return ApiResponse.success(res, list);
  }

  async invoke(req, res, next) {
    try {
      const response = await eventGptToolService.invoke(req.body, req.user || null);
      return ApiResponse.success(res, response);
    } catch (err) {
      next(err);
    }
  }
}

export const agentController = new AgentController();
export default agentController;
