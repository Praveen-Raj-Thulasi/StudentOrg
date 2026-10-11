import { RecommendationService } from '../services/recommendation.service.js';
import { ApiResponse } from '../utils/apiResponse.js';

export class RecommendationController {
  static async discover(req, res) {
    const userId = req.user?.id || null;
    const { lat, lon } = req.query;
    const categories = await RecommendationService.getDiscoverRecommendations(userId, lat, lon);
    return ApiResponse.success(res, categories);
  }

  static async getInterests(req, res) {
    const interests = await RecommendationService.getOrCreateInterest(req.user.id);
    return ApiResponse.success(res, interests);
  }

  static async updateInterests(req, res) {
    const interests = await RecommendationService.updateInterest(req.user.id, req.body);
    return ApiResponse.success(res, interests, 'Interests updated');
  }
}

export default RecommendationController;
