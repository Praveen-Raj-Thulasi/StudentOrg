import { VolunteerService } from '../services/volunteer.service.js';
import { FinanceService } from '../services/finance.service.js';
import { ApiResponse } from '../utils/apiResponse.js';

export class VolunteerController {
  static async getOverview(req, res, next) {
    try {
      const data = await VolunteerService.getVolunteerDashboard(req.user.id);
      return ApiResponse.success(res, data);
    } catch (err) {
      next(err);
    }
  }

  static async getProfile(req, res, next) {
    try {
      const data = await VolunteerService.getVolunteerProfile(req.user.id);
      return ApiResponse.success(res, data);
    } catch (err) {
      next(err);
    }
  }

  static async updateProfile(req, res, next) {
    try {
      const data = await VolunteerService.updateVolunteerProfile(req.user.id, req.body);
      return ApiResponse.success(res, data, 'Volunteer profile updated');
    } catch (err) {
      next(err);
    }
  }

  static async getMyTasks(req, res, next) {
    try {
      const { status } = req.query;
      const data = await VolunteerService.getMyTasks(req.user.id, status);
      return ApiResponse.success(res, data);
    } catch (err) {
      next(err);
    }
  }

  static async getTaskById(req, res, next) {
    try {
      const { id } = req.params;
      const data = await VolunteerService.getTask(id, req.user.id);
      return ApiResponse.success(res, data);
    } catch (err) {
      next(err);
    }
  }

  static async updateTaskStatus(req, res, next) {
    try {
      const { id } = req.params;
      const data = await VolunteerService.updateTaskStatus(id, req.user.id, req.body);
      return ApiResponse.success(res, data, 'Task status updated');
    } catch (err) {
      next(err);
    }
  }

  static async createTask(req, res, next) {
    try {
      const data = await VolunteerService.createTask(req.user.id, req.body);
      return ApiResponse.success(res, data, 'Volunteer task created', 201);
    } catch (err) {
      next(err);
    }
  }

  static async getOrganizerTasks(req, res, next) {
    try {
      const { eventId, status } = req.query;
      const data = await VolunteerService.getOrganizerTasks(req.user.id, { eventId, status });
      return ApiResponse.success(res, data);
    } catch (err) {
      next(err);
    }
  }

  static async getAvailableVolunteers(_req, res, next) {
    try {
      const data = await VolunteerService.getAvailableVolunteers();
      return ApiResponse.success(res, data);
    } catch (err) {
      next(err);
    }
  }

  static async verifyTaskCompletion(req, res, next) {
    try {
      const { id } = req.params;
      const data = await VolunteerService.verifyTaskCompletion(req.user.id, id, req.body);
      return ApiResponse.success(res, data, 'Task verified successfully');
    } catch (err) {
      next(err);
    }
  }

  static async getOpportunities(req, res, next) {
    try {
      const data = await VolunteerService.getOpportunities(req.user.id);
      return ApiResponse.success(res, data);
    } catch (err) {
      next(err);
    }
  }

  static async applyForOpportunity(req, res, next) {
    try {
      const { eventId } = req.params;
      const data = await VolunteerService.applyForOpportunity(req.user.id, eventId, req.body);
      return ApiResponse.created(res, data, 'Volunteer application submitted');
    } catch (err) {
      next(err);
    }
  }

  static async getMyApplications(req, res, next) {
    try {
      const data = await VolunteerService.getMyApplications(req.user.id);
      return ApiResponse.success(res, data);
    } catch (err) {
      next(err);
    }
  }

  static async withdrawApplication(req, res, next) {
    try {
      const { id } = req.params;
      const data = await VolunteerService.withdrawApplication(req.user.id, id);
      return ApiResponse.success(res, data, 'Application withdrawn successfully');
    } catch (err) {
      next(err);
    }
  }

  static async getOrganizerApplications(req, res, next) {
    try {
      const { eventId, status } = req.query;
      const data = await VolunteerService.getOrganizerApplications(req.user.id, { eventId, status });
      return ApiResponse.success(res, data);
    } catch (err) {
      next(err);
    }
  }

  static async reviewApplication(req, res, next) {
    try {
      const { id } = req.params;
      const data = await VolunteerService.reviewApplication(req.user.id, id, req.body);
      return ApiResponse.success(res, data, `Application marked as ${data.status}`);
    } catch (err) {
      next(err);
    }
  }

  static async getSmartMatches(req, res, next) {
    try {
      const data = await VolunteerService.getSmartMatches(req.user.id);
      return ApiResponse.success(res, data);
    } catch (err) {
      next(err);
    }
  }

  static async getContributions(req, res, next) {
    try {
      const data = await VolunteerService.getContributions(req.user.id);
      return ApiResponse.success(res, data);
    } catch (err) {
      next(err);
    }
  }

  static async getDigitalId(req, res, next) {
    try {
      const data = await VolunteerService.getDigitalId(req.user.id);
      return ApiResponse.success(res, data);
    } catch (err) {
      next(err);
    }
  }

  static async getReimbursements(req, res, next) {
    try {
      const data = await FinanceService.getMyClaims(req.user.id);
      return ApiResponse.success(res, data);
    } catch (err) {
      next(err);
    }
  }

  static async submitReimbursement(req, res, next) {
    try {
      const data = await FinanceService.submitReimbursementClaim(req.body, req.user.id);
      return ApiResponse.created(res, data, 'Reimbursement claim submitted');
    } catch (err) {
      next(err);
    }
  }

  static async uploadReimbursementReceipt(req, res, next) {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'Select a receipt image to upload.' });
      }
      return ApiResponse.created(res, {
        receiptUrl: `/uploads/reimbursements/${req.file.filename}`,
        fileName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
      }, 'Receipt image uploaded');
    } catch (err) {
      next(err);
    }
  }
}

export default VolunteerController;
