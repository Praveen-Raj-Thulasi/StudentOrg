import { EventService } from '../services/event.service.js';
import {
  ApprovalRequest,
  User,
  Organizer,
  Event,
  Payment,
  Refund,
  AuditLog,
  Membership,
  MembershipDues,
  Booking,
} from '../models/index.js';
import { ApiResponse } from '../utils/apiResponse.js';

export class AdminController {
  static async dashboard(_req, res) {
    const now = new Date();

    const [
      totalUsers,
      totalOrganizers,
      totalEvents,
      pendingApprovals,
      payments,
      refundRequests,
      activeEvents,
      cancelledEvents,
      pendingMemberships,
      approvedMemberships,
      activeMemberships,
      rejectedMemberships,
      suspendedMemberships,
      totalBookings,
      confirmedBookings,
      presentAttendance,
      upcomingEvents,
    ] = await Promise.all([
      User.countDocuments(),
      Organizer.countDocuments(),
      Event.countDocuments(),
      ApprovalRequest.countDocuments({ status: 'PENDING' }),
      Payment.find({ paymentStatus: 'SUCCESSFUL' }).select('amount').lean(),
      Refund.countDocuments(),
      Event.countDocuments({ status: 'PUBLISHED' }),
      Event.countDocuments({ status: 'CANCELLED' }),
      Membership.countDocuments({ status: 'PENDING' }),
      Membership.countDocuments({ status: 'APPROVED' }),
      Membership.countDocuments({ status: 'ACTIVE' }),
      Membership.countDocuments({ status: 'REJECTED' }),
      Membership.countDocuments({ status: 'SUSPENDED' }),
      Booking.countDocuments(),
      Booking.countDocuments({ bookingStatus: 'CONFIRMED' }),
      Booking.countDocuments({ attendanceStatus: 'PRESENT' }),
      Event.countDocuments({ status: 'PUBLISHED', startDate: { $gte: now } }),
    ]);

    const totalRevenue = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const operationalAlerts = pendingApprovals + pendingMemberships + refundRequests;

    return ApiResponse.success(res, {
      totalUsers,
      totalOrganizers,
      totalRegisteredAccounts: totalUsers + totalOrganizers,
      totalEvents,
      pendingApprovals,
      totalRevenue,
      refundRequests,
      activeEvents,
      cancelledEvents,
      // President Club Overview & Membership metrics
      membershipMetrics: {
        pending: pendingMemberships,
        approved: approvedMemberships,
        active: activeMemberships,
        rejected: rejectedMemberships,
        suspended: suspendedMemberships,
        totalEnrolled: activeMemberships + approvedMemberships,
      },
      // Event & Attendee metrics
      eventMetrics: {
        published: activeEvents,
        upcoming: upcomingEvents,
        cancelled: cancelledEvents,
        totalBookings,
        confirmedBookings,
        presentAttendance,
      },
      operationalAlerts,
    });
  }

  static async approvals(req, res) {
    const page = Math.max(0, parseInt(req.query.page || 0, 10));
    const size = Math.min(100, Math.max(1, parseInt(req.query.size || 10, 10)));
    const filter = {};

    if (req.query.status) {
      filter.status = req.query.status.toUpperCase();
    }

    const totalElements = await ApprovalRequest.countDocuments(filter);
    const totalPages = Math.ceil(totalElements / size) || 0;

    const approvalsList = await ApprovalRequest.find(filter)
      .populate('event')
      .populate('organizer')
      .sort({ requestedAt: -1 })
      .skip(page * size)
      .limit(size);

    return ApiResponse.success(res, {
      content: approvalsList,
      page,
      size,
      totalElements,
      totalPages,
      first: page === 0,
      last: page >= totalPages - 1,
    });
  }

  static async reviewEvent(req, res) {
    const { eventId } = req.params;
    const { decision, reason } = req.body;
    const result = await EventService.reviewEvent(eventId, req.user.id, decision, reason);
    return ApiResponse.success(res, result, 'Review saved');
  }

  static async users(req, res) {
    const page = Math.max(0, parseInt(req.query.page || 0, 10));
    const size = Math.min(100, Math.max(1, parseInt(req.query.size || 10, 10)));
    const filter = {};

    if (req.query.search && String(req.query.search).trim()) {
      const regex = new RegExp(String(req.query.search).trim(), 'i');
      filter.$or = [
        { name: regex },
        { email: regex },
        { memberNumber: regex },
        { userCode: regex },
      ];
    }

    if (req.query.role && req.query.role !== 'ALL') {
      const roleStr = String(req.query.role).toUpperCase();
      filter.$or = [{ role: roleStr }, { roles: roleStr }];
    }

    const totalElements = await User.countDocuments(filter);
    const totalPages = Math.ceil(totalElements / size) || 0;
    const content = await User.find(filter)
      .select('-passwordHash')
      .sort({ createdAt: -1 })
      .skip(page * size)
      .limit(size)
      .lean();

    return ApiResponse.success(res, {
      content,
      page,
      size,
      totalElements,
      totalPages,
      first: page === 0,
      last: page >= totalPages - 1,
    });
  }

  static async organizers(req, res) {
    const page = Math.max(0, parseInt(req.query.page || 0, 10));
    const size = Math.min(100, Math.max(1, parseInt(req.query.size || 10, 10)));

    const totalElements = await Organizer.countDocuments();
    const totalPages = Math.ceil(totalElements / size) || 0;
    const content = await Organizer.find()
      .select('-passwordHash')
      .sort({ createdAt: -1 })
      .skip(page * size)
      .limit(size)
      .lean();

    return ApiResponse.success(res, {
      content,
      page,
      size,
      totalElements,
      totalPages,
      first: page === 0,
      last: page >= totalPages - 1,
    });
  }

  static async events(req, res) {
    const page = Math.max(0, parseInt(req.query.page || 0, 10));
    const size = Math.min(100, Math.max(1, parseInt(req.query.size || 10, 10)));

    const totalElements = await Event.countDocuments();
    const totalPages = Math.ceil(totalElements / size) || 0;
    const content = await Event.find()
      .populate('organizer', 'organizerName organizationName email')
      .sort({ createdAt: -1 })
      .skip(page * size)
      .limit(size)
      .lean();

    return ApiResponse.success(res, {
      content,
      page,
      size,
      totalElements,
      totalPages,
      first: page === 0,
      last: page >= totalPages - 1,
    });
  }

  static async payments(req, res) {
    const page = Math.max(0, parseInt(req.query.page || 0, 10));
    const size = Math.min(100, Math.max(1, parseInt(req.query.size || 10, 10)));

    const totalElements = await Payment.countDocuments();
    const totalPages = Math.ceil(totalElements / size) || 0;
    const content = await Payment.find()
      .populate('booking')
      .sort({ createdAt: -1 })
      .skip(page * size)
      .limit(size)
      .lean();

    return ApiResponse.success(res, {
      content,
      page,
      size,
      totalElements,
      totalPages,
      first: page === 0,
      last: page >= totalPages - 1,
    });
  }

  static async refunds(req, res) {
    const page = Math.max(0, parseInt(req.query.page || 0, 10));
    const size = Math.min(100, Math.max(1, parseInt(req.query.size || 10, 10)));

    const totalElements = await Refund.countDocuments();
    const totalPages = Math.ceil(totalElements / size) || 0;
    const content = await Refund.find()
      .populate('payment')
      .sort({ createdAt: -1 })
      .skip(page * size)
      .limit(size)
      .lean();

    return ApiResponse.success(res, {
      content,
      page,
      size,
      totalElements,
      totalPages,
      first: page === 0,
      last: page >= totalPages - 1,
    });
  }

  static async updateRefundStatus(req, res) {
    const { refundId } = req.params;
    const { status, note } = req.body;
    const refund = await Refund.findOne({ id: Number(refundId) });
    if (!refund) {
      return ApiResponse.error(res, { message: 'Refund not found', statusCode: 404 });
    }
    refund.status = status;
    if (note) refund.reason = note;
    await refund.save();
    return ApiResponse.success(res, refund, 'Refund status updated');
  }

  static async auditLogs(req, res) {
    const page = Math.max(0, parseInt(req.query.page || 0, 10));
    const size = Math.min(100, Math.max(1, parseInt(req.query.size || 10, 10)));
    const filter = {};

    if (req.query.action && req.query.action !== 'ALL') {
      filter.action = String(req.query.action).trim();
    }

    if (req.query.targetType && req.query.targetType !== 'ALL') {
      filter.targetType = String(req.query.targetType).trim();
    }

    if (req.query.actorType && req.query.actorType !== 'ALL') {
      filter.actorType = String(req.query.actorType).trim();
    }

    if (req.query.search && String(req.query.search).trim()) {
      const regex = new RegExp(String(req.query.search).trim(), 'i');
      filter.$or = [
        { action: regex },
        { targetType: regex },
        { details: regex },
      ];
    }

    const totalElements = await AuditLog.countDocuments(filter);
    const totalPages = Math.ceil(totalElements / size) || 0;
    const content = await AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(page * size)
      .limit(size)
      .lean();

    return ApiResponse.success(res, {
      content,
      page,
      size,
      totalElements,
      totalPages,
      first: page === 0,
      last: page >= totalPages - 1,
    });
  }
}

export default AdminController;
