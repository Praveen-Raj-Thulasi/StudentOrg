import { eventGptPhaseService } from '../services/eventGptPhaseService.js';
import { ApiResponse } from '../utils/apiResponse.js';

export class EventGptController {
  status(req, res) {
    const data = eventGptPhaseService.phaseStatus();
    return ApiResponse.success(res, data);
  }

  async travelPlan(req, res, next) {
    try {
      const data = await eventGptPhaseService.travelPlan(req.params.eventId);
      return ApiResponse.success(res, data);
    } catch (err) {
      next(err);
    }
  }

  async travelDetails(req, res, next) {
    try {
      const data = await eventGptPhaseService.travelPlan(req.params.eventId);
      return ApiResponse.success(res, data);
    } catch (err) {
      next(err);
    }
  }

  async eventQa(req, res, next) {
    try {
      const data = await eventGptPhaseService.eventQuestionAnswer(
        req.params.eventId,
        req.body?.question || ''
      );
      return ApiResponse.success(res, data);
    } catch (err) {
      next(err);
    }
  }

  async packingChecklist(req, res, next) {
    try {
      const data = await eventGptPhaseService.packingChecklist(req.params.eventId);
      return ApiResponse.success(res, data);
    } catch (err) {
      next(err);
    }
  }

  async feedbackAnalysis(req, res, next) {
    try {
      const data = await eventGptPhaseService.analyzeFeedback(req.params.eventId);
      return ApiResponse.success(res, data);
    } catch (err) {
      next(err);
    }
  }

  async prediction(req, res, next) {
    try {
      const data = await eventGptPhaseService.predict(
        req.params.eventId,
        req.user?.id
      );
      return ApiResponse.success(res, data);
    } catch (err) {
      next(err);
    }
  }
}

export const eventGptController = new EventGptController();
export default eventGptController;
