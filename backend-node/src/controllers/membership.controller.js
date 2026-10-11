import { MembershipService } from '../services/membership.service.js';
import { paymentService } from '../services/payment.service.js';
import { ApiResponse } from '../utils/apiResponse.js';

export class MembershipController {
  static async apply(req, res, next) {
    try {
      const data = await MembershipService.applyForMembership(req.user.id, req.body);
      return ApiResponse.success(res, data, 'Membership application submitted successfully', 201);
    } catch (err) {
      next(err);
    }
  }

  static async getMyMembership(req, res, next) {
    try {
      const data = await MembershipService.getMyMembership(req.user.id);
      return ApiResponse.success(res, data);
    } catch (err) {
      next(err);
    }
  }

  static async renew(req, res, next) {
    try {
      const data = await MembershipService.renewMembership(req.user.id, req.body);
      return ApiResponse.success(res, data, 'Membership renewed successfully');
    } catch (err) {
      next(err);
    }
  }

  static async getPendingApplications(req, res, next) {
    try {
      const data = await MembershipService.getPendingApplications();
      return ApiResponse.success(res, data);
    } catch (err) {
      next(err);
    }
  }

  static async getAllMemberships(req, res, next) {
    try {
      const data = await MembershipService.getAllMemberships(req.query.status);
      return ApiResponse.success(res, data);
    } catch (err) {
      next(err);
    }
  }

  static async approveApplication(req, res, next) {
    try {
      const { id } = req.params;
      const data = await MembershipService.approveApplication(id, req.user.id, req.body);
      return ApiResponse.success(res, data, 'Membership application approved');
    } catch (err) {
      next(err);
    }
  }

  static async rejectApplication(req, res, next) {
    try {
      const { id } = req.params;
      const data = await MembershipService.rejectApplication(id, req.user.id, req.body);
      return ApiResponse.success(res, data, 'Membership application rejected');
    } catch (err) {
      next(err);
    }
  }

  static async suspendMembership(req, res, next) {
    try {
      const { id } = req.params;
      const data = await MembershipService.suspendMembership(id, req.user.id, req.body);
      return ApiResponse.success(res, data, 'Membership suspended');
    } catch (err) {
      next(err);
    }
  }

  static async activateMembership(req, res, next) {
    try {
      const { id } = req.params;
      const data = await MembershipService.activateMembership(id, req.user.id);
      return ApiResponse.success(res, data, 'Membership activated');
    } catch (err) {
      next(err);
    }
  }

  static async getMyDues(req, res, next) {
    try {
      const data = await MembershipService.getMyDues(req.user.id);
      return ApiResponse.success(res, data);
    } catch (err) {
      next(err);
    }
  }

  static async getAllDues(req, res, next) {
    try {
      const { page, size, status, academicTerm, search } = req.query;
      const data = await MembershipService.getAllDues({ page, size, status, academicTerm, search });
      return ApiResponse.success(res, data);
    } catch (err) {
      next(err);
    }
  }

  static async assessDues(req, res, next) {
    try {
      const data = await MembershipService.assessDues(req.user.id, req.body);
      return ApiResponse.success(res, data, 'Dues assessed successfully', 201);
    } catch (err) {
      next(err);
    }
  }

  static async settleDues(req, res, next) {
    try {
      const { id } = req.params;
      const data = await MembershipService.settleDues(id, req.user.id, req.body);
      return ApiResponse.success(res, data, 'Dues settled successfully');
    } catch (err) {
      next(err);
    }
  }

  static async waiveDues(req, res, next) {
    try {
      const { id } = req.params;
      const data = await MembershipService.waiveDues(id, req.user.id, req.body);
      return ApiResponse.success(res, data, 'Dues waived successfully');
    } catch (err) {
      next(err);
    }
  }

  static async createRazorpayOrder(req, res, next) {
    try {
      const { id } = req.params;
      const data = await paymentService.createRazorpayOrderForDues(id, req.user.id);
      return ApiResponse.success(res, data, 'Razorpay order created for dues');
    } catch (err) {
      next(err);
    }
  }

  static async verifyRazorpayPayment(req, res, next) {
    try {
      const { id } = req.params;
      const data = await paymentService.verifyRazorpayDuesPayment(id, req.user.id, req.body);
      return ApiResponse.success(res, data, 'Dues payment verified successfully');
    } catch (err) {
      next(err);
    }
  }
}

export default MembershipController;
