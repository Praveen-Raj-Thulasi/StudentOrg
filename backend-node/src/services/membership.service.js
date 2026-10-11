import { Membership, MembershipDues, User, AuditLog } from '../models/index.js';
import { NotFoundError, BadRequestError, ForbiddenError, ConflictError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export class MembershipService {
  /**
   * Submit an application for Skyline Student Association membership.
   */
  static async applyForMembership(userId, data = {}) {
    const user = await User.findOne({ id: userId });
    if (!user) throw new NotFoundError('User not found');

    // Prevent duplicate active or pending applications
    const activeOrPending = await Membership.findOne({
      userId,
      status: { $in: ['PENDING', 'APPROVED', 'ACTIVE'] },
    });
    if (activeOrPending) {
      throw new ConflictError(
        `You already have an application in ${activeOrPending.status} state (ID: ${activeOrPending.id})`
      );
    }

    const membership = new Membership({
      userId: user.id,
      user: user._id,
      memberNumber: user.memberNumber,
      status: 'PENDING',
      statement: (data.statement || '').trim(),
      department: (data.department || user.organizationName || '').trim(),
      yearOfStudy: (data.yearOfStudy || '').trim(),
      appliedAt: new Date(),
    });

    const saved = await membership.save();

    await this.recordAudit(
      userId,
      'USER',
      'MEMBERSHIP_APPLIED',
      'MEMBERSHIP',
      String(saved.id),
      `User ${user.email} applied for membership with member number ${user.memberNumber}`
    );

    return this.toMembershipResponse(saved, user);
  }

  /**
   * Retrieve current user's membership and dues status.
   */
  static async getMyMembership(userId) {
    const user = await User.findOne({ id: userId });
    if (!user) throw new NotFoundError('User not found');

    const membership = await Membership.findOne({ userId })
      .sort({ createdAt: -1 })
      .populate('user');

    const duesSummary = await this.getMyDues(userId);

    if (!membership) {
      return {
        id: null,
        userId: user.id,
        memberNumber: user.memberNumber,
        status: 'NOT_APPLIED',
        appliedAt: null,
        reviewedAt: null,
        validUntil: null,
        isRenewalEligible: false,
        daysUntilExpiry: null,
        dues: duesSummary,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          memberNumber: user.memberNumber,
        },
      };
    }

    // Auto-update expired membership
    if (membership.status === 'ACTIVE' && membership.validUntil && new Date(membership.validUntil) < new Date()) {
      membership.status = 'EXPIRED';
      await membership.save();
    }

    const res = this.toMembershipResponse(membership, user);
    res.dues = duesSummary;
    return res;
  }

  /**
   * President review: list pending membership applications.
   */
  static async getPendingApplications() {
    const applications = await Membership.find({ status: 'PENDING' })
      .populate('user', 'id name email memberNumber organizationName')
      .sort({ appliedAt: -1 });

    return applications.map((m) => this.toMembershipResponse(m, m.user));
  }

  /**
   * President review: list all applications with optional status filter.
   */
  static async getAllMemberships(filterStatus = null) {
    const query = {};
    if (filterStatus) {
      query.status = String(filterStatus).toUpperCase();
    }

    const memberships = await Membership.find(query)
      .populate('user', 'id name email memberNumber organizationName')
      .populate('reviewer', 'id name email')
      .sort({ createdAt: -1 });

    return memberships.map((m) => this.toMembershipResponse(m, m.user));
  }

  /**
   * President action: approve application.
   */
  static async approveApplication(membershipId, presidentId, { note = '', duesAmount = 0, term = '2026-2027' } = {}) {
    const membership = await Membership.findOne({ id: Number(membershipId) }).populate('user');
    if (!membership) throw new NotFoundError('Membership application not found');

    if (membership.status !== 'PENDING') {
      throw new BadRequestError(`Cannot approve an application in ${membership.status} status`);
    }

    membership.status = 'APPROVED';
    membership.reviewedBy = presidentId;
    membership.reviewedAt = new Date();
    membership.reviewerNote = note ? note.trim() : null;

    // Default 1-year association validity
    const oneYearLater = new Date();
    oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);
    membership.validUntil = oneYearLater;

    // If dues amount is assessed on approval, create dues obligation
    let assessedDues = null;
    const numericDues = Number(duesAmount);
    if (!isNaN(numericDues) && numericDues > 0) {
      assessedDues = new MembershipDues({
        membershipId: membership.id,
        membership: membership._id,
        userId: membership.userId,
        user: membership.user?._id,
        title: 'Annual Student Association Membership Dues',
        academicTerm: term,
        amount: numericDues,
        currency: 'INR',
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days due
        status: 'PENDING',
        assessedBy: presidentId,
      });
      await assessedDues.save();
    } else {
      // If zero dues, automatically activate membership
      membership.status = 'ACTIVE';
      membership.activatedAt = new Date();
    }

    await membership.save();

    await this.recordAudit(
      presidentId,
      'PRESIDENT',
      'MEMBERSHIP_APPROVED',
      'MEMBERSHIP',
      String(membership.id),
      `President ${presidentId} approved membership ${membership.id} (Status: ${membership.status})`
    );

    const response = this.toMembershipResponse(membership, membership.user);
    if (assessedDues) {
      response.assessedDues = assessedDues;
    }
    return response;
  }

  /**
   * President action: reject application.
   */
  static async rejectApplication(membershipId, presidentId, { reason = '', note = '' } = {}) {
    const membership = await Membership.findOne({ id: Number(membershipId) }).populate('user');
    if (!membership) throw new NotFoundError('Membership application not found');

    if (membership.status !== 'PENDING') {
      throw new BadRequestError(`Cannot reject an application in ${membership.status} status`);
    }

    const rejectionMsg = (reason || note || 'Application rejected by President').trim();

    membership.status = 'REJECTED';
    membership.reviewedBy = presidentId;
    membership.reviewedAt = new Date();
    membership.rejectionReason = rejectionMsg;
    membership.reviewerNote = note ? note.trim() : null;
    await membership.save();

    await this.recordAudit(
      presidentId,
      'PRESIDENT',
      'MEMBERSHIP_REJECTED',
      'MEMBERSHIP',
      String(membership.id),
      `President ${presidentId} rejected membership ${membership.id}: ${rejectionMsg}`
    );

    return this.toMembershipResponse(membership, membership.user);
  }

  /**
   * President action: suspend membership.
   */
  static async suspendMembership(membershipId, presidentId, { reason = '' } = {}) {
    const membership = await Membership.findOne({ id: Number(membershipId) }).populate('user');
    if (!membership) throw new NotFoundError('Membership not found');

    if (membership.status !== 'ACTIVE' && membership.status !== 'APPROVED') {
      throw new BadRequestError(`Cannot suspend membership in ${membership.status} status`);
    }

    membership.status = 'SUSPENDED';
    membership.suspendedAt = new Date();
    membership.suspensionReason = (reason || 'Suspended by President').trim();
    await membership.save();

    await this.recordAudit(
      presidentId,
      'PRESIDENT',
      'MEMBERSHIP_SUSPENDED',
      'MEMBERSHIP',
      String(membership.id),
      `President ${presidentId} suspended membership ${membership.id}: ${membership.suspensionReason}`
    );

    return this.toMembershipResponse(membership, membership.user);
  }

  /**
   * President action: activate membership (e.g. from APPROVED or SUSPENDED).
   */
  static async activateMembership(membershipId, presidentId) {
    const membership = await Membership.findOne({ id: Number(membershipId) }).populate('user');
    if (!membership) throw new NotFoundError('Membership not found');

    membership.status = 'ACTIVE';
    membership.activatedAt = new Date();
    membership.suspensionReason = null;
    membership.suspendedAt = null;
    await membership.save();

    await this.recordAudit(
      presidentId,
      'PRESIDENT',
      'MEMBERSHIP_ACTIVATED',
      'MEMBERSHIP',
      String(membership.id),
      `President ${presidentId} activated membership ${membership.id}`
    );

    return this.toMembershipResponse(membership, membership.user);
  }

  /**
   * Dues: server-side calculation of user's financial obligations.
   */
  static async getMyDues(userId) {
    const items = await MembershipDues.find({ userId }).sort({ createdAt: -1 });

    let totalAssessed = 0;
    let totalPaid = 0;
    let outstandingBalance = 0;

    for (const item of items) {
      if (item.status !== 'CANCELLED' && item.status !== 'WAIVED') {
        totalAssessed += item.amount;
      }
      if (item.status === 'PAID') {
        totalPaid += item.amount;
      }
      if (item.status === 'PENDING' || item.status === 'OVERDUE') {
        outstandingBalance += item.amount;
      }
    }

    return {
      userId,
      totalAssessed: Number(totalAssessed.toFixed(2)),
      totalPaid: Number(totalPaid.toFixed(2)),
      outstandingBalance: Number(outstandingBalance.toFixed(2)),
      items: items.map((d) => ({
        id: d.id,
        membershipId: d.membershipId,
        title: d.title,
        academicTerm: d.academicTerm,
        amount: d.amount,
        currency: d.currency,
        dueDate: d.dueDate,
        status: d.status,
        paidAt: d.paidAt,
        paymentReference: d.paymentReference,
        waiverReason: d.waiverReason,
      })),
    };
  }

  /**
   * Dues: President / Treasurer list all dues with filtering, search & summary aggregates.
   */
  static async getAllDues({ page = 0, size = 20, status = null, academicTerm = null, search = null } = {}) {
    const pageNum = Math.max(0, parseInt(page || 0, 10));
    const sizeNum = Math.min(100, Math.max(1, parseInt(size || 20, 10)));
    const filter = {};

    if (status && status !== 'ALL') {
      filter.status = String(status).toUpperCase();
    }
    if (academicTerm && academicTerm !== 'ALL') {
      filter.academicTerm = String(academicTerm).trim();
    }

    if (search && String(search).trim()) {
      const searchRegex = new RegExp(String(search).trim(), 'i');
      const matchingUsers = await User.find({
        $or: [
          { name: searchRegex },
          { email: searchRegex },
          { memberNumber: searchRegex },
        ],
      }).select('id');
      const matchingUserIds = matchingUsers.map((u) => u.id);
      filter.userId = { $in: matchingUserIds };
    }

    // Compute live financial metrics across all dues records
    const allDues = await MembershipDues.find({});
    let totalAssessed = 0;
    let totalCollected = 0;
    let totalOutstanding = 0;
    let totalOverdue = 0;
    let pendingCount = 0;

    const now = new Date();
    for (const d of allDues) {
      if (d.status !== 'CANCELLED' && d.status !== 'WAIVED') {
        totalAssessed += d.amount;
      }
      if (d.status === 'PAID') {
        totalCollected += d.amount;
      }
      if (d.status === 'PENDING' || d.status === 'OVERDUE') {
        totalOutstanding += d.amount;
      }
      if (d.status === 'OVERDUE' || (d.status === 'PENDING' && d.dueDate && d.dueDate < now)) {
        totalOverdue += d.amount;
      }
      if (d.status === 'PENDING') {
        pendingCount++;
      }
    }

    const totalElements = await MembershipDues.countDocuments(filter);
    const totalPages = Math.ceil(totalElements / sizeNum) || 0;

    const duesList = await MembershipDues.find(filter)
      .populate('user', 'id name email memberNumber organizationName')
      .sort({ createdAt: -1 })
      .skip(pageNum * sizeNum)
      .limit(sizeNum);

    const availableTerms = await MembershipDues.distinct('academicTerm');

    return {
      summary: {
        totalAssessed: Number(totalAssessed.toFixed(2)),
        totalCollected: Number(totalCollected.toFixed(2)),
        totalOutstanding: Number(totalOutstanding.toFixed(2)),
        totalOverdue: Number(totalOverdue.toFixed(2)),
        pendingCount,
      },
      availableTerms,
      content: duesList.map((d) => ({
        id: d.id,
        membershipId: d.membershipId,
        userId: d.userId,
        user: d.user
          ? {
              id: d.user.id || d.userId,
              name: d.user.name || 'Member',
              email: d.user.email || '',
              memberNumber: d.user.memberNumber || null,
            }
          : null,
        title: d.title,
        academicTerm: d.academicTerm,
        amount: d.amount,
        currency: d.currency,
        dueDate: d.dueDate,
        status: d.status,
        paidAt: d.paidAt,
        paymentReference: d.paymentReference,
        waiverReason: d.waiverReason,
        createdAt: d.createdAt,
      })),
      page: pageNum,
      size: sizeNum,
      totalElements,
      totalPages,
      first: pageNum === 0,
      last: pageNum >= totalPages - 1,
    };
  }

  /**
   * Dues: President or Treasurer assesses dues for a student.
   */
  static async assessDues(assessorId, { userId, amount, title, academicTerm, dueDate }) {
    const numericUserId = Number(userId);
    const user = await User.findOne({ id: numericUserId });
    if (!user) throw new NotFoundError('Target user not found');

    const membership = await Membership.findOne({
      userId: numericUserId,
      status: { $in: ['APPROVED', 'ACTIVE', 'PENDING'] },
    });
    if (!membership) {
      throw new BadRequestError('User does not have an approved, active, or pending membership application');
    }

    const numericAmount = Number(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      throw new BadRequestError('Amount must be a positive number');
    }

    const term = (academicTerm || '2026-2027').trim();

    // Prevent duplicate dues assessment for the same user and term
    const existing = await MembershipDues.findOne({
      userId: numericUserId,
      academicTerm: term,
      status: { $ne: 'CANCELLED' },
    });
    if (existing) {
      throw new ConflictError(`Dues obligation for academic term '${term}' already exists (Dues ID: ${existing.id})`);
    }

    const due = new MembershipDues({
      membershipId: membership.id,
      membership: membership._id,
      userId: numericUserId,
      user: user._id,
      title: (title || 'Annual Student Association Membership Dues').trim(),
      academicTerm: term,
      amount: numericAmount,
      currency: 'INR',
      dueDate: dueDate ? new Date(dueDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      status: 'PENDING',
      assessedBy: assessorId,
    });

    const saved = await due.save();

    await this.recordAudit(
      assessorId,
      'TREASURER',
      'DUES_ASSESSED',
      'MEMBERSHIP_DUES',
      String(saved.id),
      `Dues of ₹${numericAmount} assessed for user ${numericUserId} (${term})`
    );

    return saved;
  }

  /**
   * Settle dues payment securely on the server.
   */
  static async settleDues(duesId, userId, paymentDetails = {}) {
    const due = await MembershipDues.findOne({ id: Number(duesId) });
    if (!due) throw new NotFoundError('Dues record not found');

    if (due.userId !== userId) {
      throw new ForbiddenError('Unauthorized: You do not own this dues obligation');
    }

    if (due.status === 'PAID') {
      return due;
    }

    if (due.status === 'WAIVED' || due.status === 'CANCELLED') {
      throw new BadRequestError(`Cannot pay dues in ${due.status} status`);
    }

    // Require trusted gateway verification or authorized waiver for positive amounts
    if (due.amount > 0 && paymentDetails.verifiedByGateway !== true) {
      // If client provided signature verification payload, verify it via paymentService
      if (paymentDetails.razorpayOrderId && paymentDetails.razorpayPaymentId && paymentDetails.razorpaySignature) {
        const { paymentService } = await import('./payment.service.js');
        return paymentService.verifyRazorpayDuesPayment(due.id, userId, paymentDetails);
      }
      throw new BadRequestError(
        'Paid dues require verified payment gateway confirmation. Client-side confirmation is not trusted.',
        'UNVERIFIED_PAYMENT'
      );
    }

    due.status = 'PAID';
    due.paidAt = new Date();
    due.paymentReference = paymentDetails.gatewayTransactionId || `PAY-DUES-${due.id}-${Date.now()}`;
    await due.save();

    // If membership was APPROVED, transition to ACTIVE upon dues settlement
    const membership = await Membership.findOne({ id: due.membershipId });
    if (membership && membership.status === 'APPROVED') {
      membership.status = 'ACTIVE';
      membership.activatedAt = new Date();
      await membership.save();
    }

    await this.recordAudit(
      userId,
      'USER',
      'DUES_PAID',
      'MEMBERSHIP_DUES',
      String(due.id),
      `User ${userId} settled dues ${due.id} of ₹${due.amount}`
    );

    return due;
  }

  /**
   * Waive dues obligation (President or Treasurer).
   */
  static async waiveDues(duesId, authorizedUserId, { reason = '' } = {}) {
    const due = await MembershipDues.findOne({ id: Number(duesId) });
    if (!due) throw new NotFoundError('Dues record not found');

    if (due.status === 'PAID') {
      throw new BadRequestError('Cannot waive already paid dues');
    }

    due.status = 'WAIVED';
    due.waivedBy = authorizedUserId;
    due.waiverReason = (reason || 'Waived by Student Association executive').trim();
    await due.save();

    await this.recordAudit(
      authorizedUserId,
      'TREASURER',
      'DUES_WAIVED',
      'MEMBERSHIP_DUES',
      String(due.id),
      `Dues ${due.id} waived for user ${due.userId}: ${due.waiverReason}`
    );

    return due;
  }

  /**
   * Renew student membership:
   * Only allowed when current membership is EXPIRED or within 30 days of expiry.
   */
  static async renewMembership(userId, data = {}) {
    const user = await User.findOne({ id: userId });
    if (!user) throw new NotFoundError('User not found');

    const membership = await Membership.findOne({ userId })
      .sort({ createdAt: -1 })
      .populate('user');

    if (!membership) {
      throw new NotFoundError('No membership found to renew. Please apply for membership first.');
    }

    if (membership.status === 'PENDING') {
      throw new BadRequestError('Your membership application is currently pending review.');
    }
    if (membership.status === 'REJECTED') {
      throw new BadRequestError('Your previous membership application was rejected. Please submit a new application.');
    }
    if (membership.status === 'SUSPENDED') {
      throw new BadRequestError('Your membership is suspended. Please contact the Student Association executive.');
    }
    if (membership.status === 'NOT_APPLIED') {
      throw new BadRequestError('No active membership found. Please apply first.');
    }

    const now = new Date();
    const isPastExpiry = membership.validUntil && new Date(membership.validUntil) < now;
    const diffMs = membership.validUntil ? new Date(membership.validUntil).getTime() - now.getTime() : -1;
    const isWithin30Days = diffMs >= 0 && diffMs <= 30 * 24 * 60 * 60 * 1000;

    if (membership.status !== 'EXPIRED' && !isPastExpiry && !isWithin30Days) {
      throw new BadRequestError('Membership is active and not yet within the 30-day renewal window');
    }

    // Compute new validity period: 1 year from current validUntil (if still future) or 1 year from now
    const baseDate = (membership.validUntil && new Date(membership.validUntil) > now)
      ? new Date(membership.validUntil)
      : now;
    const newValidUntil = new Date(baseDate.getTime() + 365 * 24 * 60 * 60 * 1000);

    const duesAmount = Number(data.duesAmount || 0);
    const term = (data.academicTerm || '2026-2027').trim();
    let assessedDues = null;

    if (duesAmount > 0) {
      // Create pending renewal dues obligation
      assessedDues = new MembershipDues({
        membershipId: membership.id,
        membership: membership._id,
        userId: membership.userId,
        user: membership.user?._id,
        title: 'Annual Student Association Renewal Dues',
        academicTerm: term,
        amount: duesAmount,
        currency: 'INR',
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: 'PENDING',
        assessedBy: userId,
      });
      await assessedDues.save();

      membership.status = 'APPROVED'; // Pending dues payment settlement
    } else {
      membership.status = 'ACTIVE';
      membership.activatedAt = now;
    }

    membership.validUntil = newValidUntil;
    membership.renewalReminderDaysSent = [];
    await membership.save();

    await this.recordAudit(
      userId,
      'USER',
      'MEMBERSHIP_RENEWED',
      'MEMBERSHIP',
      String(membership.id),
      `User ${userId} renewed membership ${membership.id}. Valid until ${newValidUntil.toISOString()}`
    );

    const response = this.toMembershipResponse(membership, user);
    if (assessedDues) {
      response.assessedDues = assessedDues;
    }
    return response;
  }

  /**
   * Standard response envelope.
   */
  static toMembershipResponse(m, userDoc = null) {
    if (!m) return null;
    const doc = m.toObject ? m.toObject() : m;
    const u = userDoc || doc.user || {};

    let isRenewalEligible = false;
    let daysUntilExpiry = null;
    if (doc.validUntil) {
      const now = Date.now();
      const expiryTime = new Date(doc.validUntil).getTime();
      const diffMs = expiryTime - now;
      daysUntilExpiry = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      if (doc.status === 'EXPIRED' || (doc.status === 'ACTIVE' && diffMs <= 30 * 24 * 60 * 60 * 1000)) {
        isRenewalEligible = true;
      }
    } else if (doc.status === 'EXPIRED') {
      isRenewalEligible = true;
    }

    return {
      id: doc.id,
      userId: doc.userId,
      memberNumber: doc.memberNumber,
      status: doc.status,
      statement: doc.statement || null,
      department: doc.department || null,
      yearOfStudy: doc.yearOfStudy || null,
      appliedAt: doc.appliedAt || doc.createdAt,
      reviewedBy: doc.reviewedBy || null,
      reviewedAt: doc.reviewedAt || null,
      reviewerNote: doc.reviewerNote || null,
      rejectionReason: doc.rejectionReason || null,
      activatedAt: doc.activatedAt || null,
      validUntil: doc.validUntil || null,
      isRenewalEligible,
      daysUntilExpiry,
      suspendedAt: doc.suspendedAt || null,
      suspensionReason: doc.suspensionReason || null,
      user: {
        id: u.id || doc.userId,
        name: u.name || 'Member',
        email: u.email || '',
        memberNumber: u.memberNumber || doc.memberNumber,
        department: u.organizationName || null,
      },
    };
  }

  static async recordAudit(actorId, actorType, action, targetType, targetId, details) {
    try {
      await AuditLog.create({
        actorId,
        actorType,
        action,
        targetType,
        targetId,
        details,
        createdAt: new Date(),
      });
    } catch (err) {
      logger.warn({ err }, '[MembershipService] Audit log write failed');
    }
  }
}

export default MembershipService;
