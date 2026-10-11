import UserLevel from '../models/UserLevel.js';
import UserAchievement from '../models/UserAchievement.js';
import User from '../models/User.js';
import Booking from '../models/Booking.js';
import Certificate from '../models/Certificate.js';
import EventRating from '../models/EventRating.js';
import UserInterest from '../models/UserInterest.js';

export const BADGES = {
  EVENT_EXPLORER: ['Event Explorer', 'Attended 3+ events', '🎪'],
  TECH_ENTHUSIAST: ['Tech Enthusiast', 'Attended 3 tech events', '💻'],
  AI_LEARNER: ['AI Learner', 'Attended an AI event', '🤖'],
  TOP_REVIEWER: ['Top Reviewer', 'Submitted 5+ reviews', '⭐'],
  EARLY_BIRD: ['Early Bird', 'Registered within 24h of event listing', '🐦'],
  NETWORKING_PRO: ['Networking Pro', 'Connected with 5+ attendees', '🤝'],
  CERTIFICATE_COLLECTOR: ['Certificate Collector', 'Earned 3+ certificates', '🏆'],
  FIRST_STEP: ['First Step', 'Booked your first event', '🎫'],
};

export class GamificationService {
  static computeLevel(totalXp) {
    if (totalXp >= 1000) return 5;
    if (totalXp >= 500) return 4;
    if (totalXp >= 250) return 3;
    if (totalXp >= 100) return 2;
    return 1;
  }

  static nextLevelXp(current) {
    if (current < 100) return 100 - current;
    if (current < 250) return 250 - current;
    if (current < 500) return 500 - current;
    if (current < 1000) return 1000 - current;
    return 0;
  }

  static progressPercent(current) {
    if (current >= 1000) return 100;
    const thresholds = [0, 100, 250, 500, 1000];
    for (let i = 1; i < thresholds.length; i++) {
      if (current < thresholds[i]) {
        const range = thresholds[i] - thresholds[i - 1];
        const progress = current - thresholds[i - 1];
        return Math.round((progress / range) * 100);
      }
    }
    return 100;
  }

  static async getOrCreateLevel(userId) {
    const numUserId = Number(userId);
    let level = await UserLevel.findOne({ userId: numUserId });
    if (!level) {
      const user = await User.findOne({ id: numUserId });
      level = new UserLevel({
        userId: numUserId,
        user: user?._id,
        totalXp: 0,
        currentLevel: 1,
      });
      await level.save();
    }
    return level;
  }

  static async getGamificationProfile(userId) {
    const numUserId = Number(userId);
    const level = await this.getOrCreateLevel(numUserId);
    const badges = await UserAchievement.find({ userId: numUserId })
      .sort({ earnedAt: -1 })
      .lean();

    return {
      totalXp: level.totalXp,
      currentLevel: level.currentLevel,
      eventsAttended: level.eventsAttended,
      eventsRegistered: level.eventsRegistered,
      certificatesEarned: level.certificatesEarned,
      reviewsGiven: level.reviewsGiven,
      badges,
      nextLevelXp: this.nextLevelXp(level.totalXp),
      progressToNextLevel: this.progressPercent(level.totalXp),
    };
  }

  static async awardBadge(userId, badgeType) {
    const numUserId = Number(userId);
    const exists = await UserAchievement.exists({ userId: numUserId, badgeType });
    if (exists) return;

    const def = BADGES[badgeType];
    if (!def) return;

    const user = await User.findOne({ id: numUserId });
    if (!user) return;

    const achievement = new UserAchievement({
      userId: numUserId,
      user: user._id,
      badgeType,
      badgeName: def[0],
      badgeDescription: def[1],
      iconUrl: def[2],
      xpAwarded: 20,
    });
    await achievement.save();
  }

  static async getPortfolio(userId) {
    const numUserId = Number(userId);
    const user = await User.findOne({ id: numUserId }).lean();
    if (!user) return {};

    const portfolio = {
      name: user.name,
      email: user.email,
    };

    const interest = await UserInterest.findOne({ userId: numUserId }).lean();
    if (interest) {
      portfolio.department = interest.department;
      portfolio.college = interest.college;
      portfolio.yearOfStudy = interest.yearOfStudy;
      portfolio.skills = interest.skills;
      portfolio.interests = interest.interests;
      portfolio.careerGoal = interest.careerGoal;
    }

    const bookings = await Booking.find({ userId: numUserId })
      .populate('event', 'eventName category eventDate')
      .sort({ bookedAt: -1 })
      .lean();

    portfolio.totalRegistrations = bookings.length;

    const categoryDist = {};
    for (const b of bookings) {
      const cat = b.event?.category;
      if (cat) categoryDist[cat] = (categoryDist[cat] || 0) + 1;
    }
    portfolio.categoryDistribution = categoryDist;

    const confirmed = bookings.filter((b) => b.bookingStatus === 'CONFIRMED');
    portfolio.confirmedBookings = confirmed.length;

    const certs = await Certificate.find({ userId: numUserId }).lean();
    portfolio.certificatesEarned = certs.length;
    portfolio.certificates = certs.map((c) => ({
      certificateId: c.certificateId,
      eventName: c.eventName,
      issuedAt: c.issuedAt,
    }));

    const reviews = await EventRating.find({ userId: numUserId }).lean();
    portfolio.reviewsGiven = reviews.length;
    const avgReview = reviews.length
      ? reviews.reduce((sum, r) => sum + r.overallRating, 0) / reviews.length
      : 0;
    portfolio.averageRatingGiven = Math.round(avgReview * 10) / 10;

    portfolio.gamification = await this.getGamificationProfile(numUserId);

    portfolio.aiSummary = `Active student participant in ${user.department || 'technology'} programs. Has engaged in ${bookings.length} campus events and earned ${certs.length} verified completion certificates. Demonstrated strong extracurricular involvement and peer collaboration across multiple college disciplines.`;

    const skillsData = [];
    for (const [cat, count] of Object.entries(categoryDist)) {
      skillsData.push({ skill: cat, level: Math.min(count * 20, 100) });
    }
    portfolio.skillsData = skillsData;

    return portfolio;
  }
}

export default GamificationService;
