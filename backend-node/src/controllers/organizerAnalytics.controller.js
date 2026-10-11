import { OrganizerAnalyticsService } from '../services/organizerAnalytics.service.js';
import { ApiResponse } from '../utils/apiResponse.js';

export class OrganizerAnalyticsController {
  static async analytics(req, res) {
    const data = await OrganizerAnalyticsService.getOrganizerAnalytics(req.user.id);
    return ApiResponse.success(res, data);
  }

  static async leaderboard(req, res) {
    const { limit = 20 } = req.query;
    const data = await OrganizerAnalyticsService.getCollegeLeaderboard(limit);
    return ApiResponse.success(res, data);
  }

  static async ask(req, res) {
    const { q } = req.query;
    const answer = await OrganizerAnalyticsService.answerNaturalLanguageQuery(req.user.id, q);
    return ApiResponse.success(res, answer);
  }

  static async predict(req, res) {
    const { eventId } = req.params;
    const prediction = await OrganizerAnalyticsService.predictEventOutcomes(eventId, req.user.id);
    return ApiResponse.success(res, prediction);
  }

  static async exportParticipants(req, res) {
    const { eventId } = req.params;
    const { filename, data } = await OrganizerAnalyticsService.exportParticipants(eventId, req.user.id);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(data);
  }

  static async generatePoster(req, res) {
    const { eventId } = req.params;
    const posterUrl = await OrganizerAnalyticsService.generatePoster(eventId, req.user.id);
    return ApiResponse.success(res, posterUrl, 'Poster generated');
  }

  static async dashboard(req, res) {
    const data = await OrganizerAnalyticsService.getOrganizerDashboard(req.user.id);
    return ApiResponse.success(res, data);
  }

  static async participants(req, res) {
    const list = await OrganizerAnalyticsService.getParticipants(req.user.id, req.query);
    return ApiResponse.success(res, list);
  }
}

export default OrganizerAnalyticsController;
