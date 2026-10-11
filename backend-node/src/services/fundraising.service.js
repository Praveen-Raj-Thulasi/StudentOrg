import {
  FundraisingCampaign,
  FundraisingContribution,
  Payment,
  AuditLog,
} from '../models/index.js';
import { FinanceService } from './finance.service.js';
import {
  NotFoundError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
} from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export class FundraisingService {
  /* =========================================================================
   * 1. CAMPAIGN MANAGEMENT
   * ========================================================================= */

  static async createCampaign(data, ownerId) {
    if (!data.title || !data.description || data.targetAmount === undefined) {
      throw new BadRequestError('Title, description, and targetAmount are required');
    }
    const target = Number(data.targetAmount);
    if (isNaN(target) || target <= 0) {
      throw new BadRequestError('Target amount must be a positive number');
    }

    const campaign = new FundraisingCampaign({
      title: data.title.trim(),
      description: data.description.trim(),
      targetAmount: target,
      currency: data.currency || 'INR',
      startDate: data.startDate ? new Date(data.startDate) : new Date(),
      endDate: data.endDate ? new Date(data.endDate) : null,
      status: data.status || 'ACTIVE',
      category: data.category || 'COMMUNITY',
      ownerId,
    });

    const saved = await campaign.save();

    await AuditLog.create({
      userId: ownerId,
      role: 'TREASURER',
      action: 'CAMPAIGN_CREATED',
      resourceType: 'FUNDRAISING',
      resourceId: String(saved.id),
      details: `Created campaign ${saved.campaignCode}: "${saved.title}" targeting ${saved.targetAmount}`,
    }).catch((err) => logger.warn(`AuditLog failure: ${err.message}`));

    return saved;
  }

  static async updateCampaign(campaignId, data, actorId) {
    const campaign = await FundraisingCampaign.findOne({ id: Number(campaignId) });
    if (!campaign) throw new NotFoundError(`Campaign #${campaignId} not found`);

    if (data.title) campaign.title = data.title.trim();
    if (data.description) campaign.description = data.description.trim();
    if (data.targetAmount !== undefined) {
      const tgt = Number(data.targetAmount);
      if (isNaN(tgt) || tgt <= 0) throw new BadRequestError('Invalid target amount');
      campaign.targetAmount = tgt;
    }
    if (data.status) campaign.status = data.status;
    if (data.endDate !== undefined) campaign.endDate = data.endDate ? new Date(data.endDate) : null;

    const saved = await campaign.save();

    await AuditLog.create({
      userId: actorId,
      role: 'TREASURER',
      action: 'CAMPAIGN_UPDATED',
      resourceType: 'FUNDRAISING',
      resourceId: String(saved.id),
      details: `Updated campaign ${saved.campaignCode}`,
    }).catch((err) => logger.warn(`AuditLog failure: ${err.message}`));

    return saved;
  }

  /**
   * Get campaigns with totals calculated strictly from verified SUCCESSFUL contributions.
   */
  static async getCampaigns(filter = {}) {
    const query = {};
    if (filter.status) query.status = filter.status;
    if (filter.category) query.category = filter.category;

    const campaigns = await FundraisingCampaign.find(query).sort({ createdAt: -1 }).lean();

    // Pull successful contributions for all campaigns
    const campaignIds = campaigns.map((c) => c.id);
    const contributions = await FundraisingContribution.find({
      campaignId: { $in: campaignIds },
      status: 'SUCCESSFUL',
    }).select('campaignId amount').lean();

    const sumMap = {};
    const countMap = {};
    for (const c of contributions) {
      sumMap[c.campaignId] = (sumMap[c.campaignId] || 0) + Number(c.amount || 0);
      countMap[c.campaignId] = (countMap[c.campaignId] || 0) + 1;
    }

    return campaigns.map((camp) => {
      const collectedAmount = Number((sumMap[camp.id] || 0).toFixed(2));
      const donorCount = countMap[camp.id] || 0;
      const progressPercent =
        camp.targetAmount > 0
          ? Number(((collectedAmount / camp.targetAmount) * 100).toFixed(1))
          : 0;

      return {
        ...camp,
        collectedAmount,
        donorCount,
        progressPercent,
      };
    });
  }

  static async getCampaignById(campaignId) {
    const campaign = await FundraisingCampaign.findOne({ id: Number(campaignId) }).lean();
    if (!campaign) throw new NotFoundError(`Campaign #${campaignId} not found`);

    const successfulContributions = await FundraisingContribution.find({
      campaignId: campaign.id,
      status: 'SUCCESSFUL',
    }).lean();

    const collectedAmount = successfulContributions.reduce(
      (sum, c) => sum + Number(c.amount || 0),
      0
    );
    const progressPercent =
      campaign.targetAmount > 0
        ? Number(((collectedAmount / campaign.targetAmount) * 100).toFixed(1))
        : 0;

    // Public contributor list (anonymized where requested)
    const publicDonations = successfulContributions.map((c) => ({
      id: c.id,
      donorName: c.isAnonymous ? 'Anonymous Supporter' : c.donorName,
      amount: c.amount,
      currency: c.currency,
      message: c.message,
      createdAt: c.createdAt,
    }));

    return {
      ...campaign,
      collectedAmount: Number(collectedAmount.toFixed(2)),
      donorCount: successfulContributions.length,
      progressPercent,
      recentDonations: publicDonations.slice(0, 20),
    };
  }

  /* =========================================================================
   * 2. CONTRIBUTIONS & PAYMENTS
   * ========================================================================= */

  static async contribute(campaignId, { donorName, donorEmail, amount, isAnonymous = false, message = null }, donorUserId = null) {
    const campaign = await FundraisingCampaign.findOne({ id: Number(campaignId) });
    if (!campaign) throw new NotFoundError(`Campaign #${campaignId} not found`);

    if (campaign.status !== 'ACTIVE') {
      throw new BadRequestError(`Cannot contribute to campaign with status: ${campaign.status}`);
    }

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      throw new BadRequestError('Contribution amount must be greater than zero');
    }
    if (!donorName || !donorEmail) {
      throw new BadRequestError('Donor name and email are required');
    }

    const transactionId = `TXN-DON-${campaign.id}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const contribution = new FundraisingContribution({
      campaignId: campaign.id,
      donorUserId: donorUserId ? Number(donorUserId) : null,
      donorName: donorName.trim(),
      donorEmail: donorEmail.trim().toLowerCase(),
      amount: numAmount,
      currency: campaign.currency || 'INR',
      status: 'PENDING',
      isAnonymous: Boolean(isAnonymous),
      transactionId,
      message: message ? message.trim() : null,
    });

    const saved = await contribution.save();

    // Create payment intent
    const payment = new Payment({
      transactionId,
      userId: donorUserId ? Number(donorUserId) : null,
      campaignId: campaign.id,
      paymentType: 'DONATION',
      amount: numAmount,
      paymentStatus: 'PENDING',
    });
    await payment.save();

    saved.paymentId = payment.id;
    await saved.save();

    return {
      contribution: saved,
      payment,
    };
  }

  static async confirmContributionPayment(contributionId, paymentData = {}) {
    const contribution = await FundraisingContribution.findOne({ id: Number(contributionId) });
    if (!contribution) throw new NotFoundError(`Contribution #${contributionId} not found`);

    if (contribution.status === 'SUCCESSFUL') {
      return contribution; // Idempotent
    }

    contribution.status = 'SUCCESSFUL';
    contribution.receiptNumber = `REC-DON-${Date.now()}`;
    const saved = await contribution.save();

    // Update Payment record
    if (contribution.paymentId) {
      await Payment.findOneAndUpdate(
        { id: contribution.paymentId },
        {
          paymentStatus: 'SUCCESSFUL',
          paidAt: new Date(),
          gatewayReference: paymentData.gatewayReference || null,
        }
      );
    }

    // Post to General Ledger as verified INCOME
    await FinanceService.recordLedgerEntry({
      entryType: 'INCOME',
      amount: saved.amount,
      currency: saved.currency,
      category: 'DONATION',
      description: `Fundraising donation for campaign #${saved.campaignId}`,
      sourceReference: saved.contributionNumber,
      sourceModel: 'Payment',
      idempotencyKey: `DONATION_${saved.transactionId}`,
      postedBy: saved.donorUserId || 0,
    });

    return saved;
  }
}

export default FundraisingService;
