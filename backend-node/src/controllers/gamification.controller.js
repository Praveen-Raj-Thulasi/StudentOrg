import { GamificationService } from '../services/gamification.service.js';
import { ApiResponse } from '../utils/apiResponse.js';

export class GamificationController {
  static async myProfile(req, res) {
    const profile = await GamificationService.getGamificationProfile(req.user.id);
    return ApiResponse.success(res, profile);
  }

  static async myPortfolio(req, res) {
    const portfolio = await GamificationService.getPortfolio(req.user.id);
    return ApiResponse.success(res, portfolio);
  }
}

export default GamificationController;
