import { aiInsightsService } from '../services/aiInsightsService.js';
import { ApiResponse } from '../utils/apiResponse.js';

export class AIInsightsController {
  async platform(req, res, next) {
    try {
      const data = await aiInsightsService.getPlatformInsights();
      return ApiResponse.success(res, data);
    } catch (err) {
      next(err);
    }
  }

  async fraud(req, res, next) {
    try {
      const data = await aiInsightsService.getFraudReport();
      return ApiResponse.success(res, data);
    } catch (err) {
      next(err);
    }
  }

  async myBehavior(req, res, next) {
    try {
      const data = {
        message: 'Behavioral profile refresh queued. Check your portfolio for updated recommendations.',
        userId: req.user?.id,
      };
      return ApiResponse.success(res, data);
    } catch (err) {
      next(err);
    }
  }

  async refreshBehavior(req, res, next) {
    try {
      const result = await aiInsightsService.refreshBehaviorAsync(req.params.userId);
      return ApiResponse.success(res, `Behavioral profile refresh queued for userId=${req.params.userId}`);
    } catch (err) {
      next(err);
    }
  }
}

export const aiInsightsController = new AIInsightsController();
export default aiInsightsController;
