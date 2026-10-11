import { RatingService } from '../services/rating.service.js';
import { ApiResponse } from '../utils/apiResponse.js';

export class RatingController {
  static async submitRating(req, res) {
    const { eventId } = req.params;
    const rating = await RatingService.submitRating(req.user.id, eventId, req.body);
    return ApiResponse.success(res, rating, 'Review submitted', 201);
  }

  static async updateMyRating(req, res) {
    const { eventId } = req.params;
    const rating = await RatingService.updateRating(req.user.id, eventId, req.body);
    return ApiResponse.success(res, rating, 'Review updated');
  }

  static async getEventRatings(req, res) {
    const { eventId } = req.params;
    const { page = 0, size = 10 } = req.query;
    const ratings = await RatingService.getEventRatings(eventId, page, size);
    return ApiResponse.success(res, ratings);
  }

  static async getSummary(req, res) {
    const { eventId } = req.params;
    const summary = await RatingService.getEventRatingSummary(eventId);
    return ApiResponse.success(res, summary);
  }

  static async getMyReview(req, res) {
    const { eventId } = req.params;
    const review = await RatingService.getUserReview(req.user.id, eventId);
    return ApiResponse.success(res, review || null);
  }

  static async eligibility(req, res) {
    const { eventId } = req.params;
    const result = await RatingService.getFeedbackEligibility(req.user.id, eventId);
    return ApiResponse.success(res, result);
  }

  static async moderate(req, res) {
    const { ratingId } = req.params;
    const { status, note } = req.query;
    const rating = await RatingService.moderateReview(ratingId, status, note);
    return ApiResponse.success(res, rating, 'Review moderated');
  }
}

export default RatingController;
