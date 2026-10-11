import { FundraisingService } from '../services/fundraising.service.js';
import { ApiResponse } from '../utils/apiResponse.js';

export class FundraisingController {
  /* ==================== CAMPAIGNS ==================== */

  static async createCampaign(req, res, next) {
    try {
      const campaign = await FundraisingService.createCampaign(req.body, req.user.id);
      return ApiResponse.created(res, campaign, 'Campaign created successfully');
    } catch (err) {
      next(err);
    }
  }

  static async updateCampaign(req, res, next) {
    try {
      const campaign = await FundraisingService.updateCampaign(
        req.params.id,
        req.body,
        req.user.id
      );
      return ApiResponse.success(res, campaign, 'Campaign updated');
    } catch (err) {
      next(err);
    }
  }

  static async getCampaigns(req, res, next) {
    try {
      const campaigns = await FundraisingService.getCampaigns(req.query);
      return ApiResponse.success(res, campaigns);
    } catch (err) {
      next(err);
    }
  }

  static async getCampaignById(req, res, next) {
    try {
      const campaign = await FundraisingService.getCampaignById(req.params.id);
      return ApiResponse.success(res, campaign);
    } catch (err) {
      next(err);
    }
  }

  /* ==================== CONTRIBUTIONS ==================== */

  static async contribute(req, res, next) {
    try {
      const result = await FundraisingService.contribute(
        req.params.id,
        req.body,
        req.user?.id
      );
      return ApiResponse.created(res, result, 'Donation initiated');
    } catch (err) {
      next(err);
    }
  }

  static async confirmContribution(req, res, next) {
    try {
      const contribution = await FundraisingService.confirmContributionPayment(
        req.params.id,
        req.body || {}
      );
      return ApiResponse.success(res, contribution, 'Donation confirmed and posted to ledger');
    } catch (err) {
      next(err);
    }
  }
}

export default FundraisingController;
