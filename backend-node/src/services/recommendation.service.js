import Event from '../models/Event.js';
import Booking from '../models/Booking.js';
import UserInterest from '../models/UserInterest.js';
import EventRating from '../models/EventRating.js';
import User from '../models/User.js';

export class RecommendationService {
  static async getDiscoverRecommendations(userId = null, userLat = null, userLon = null) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const upcoming = await Event.find({
      status: 'PUBLISHED',
      visibility: 'PUBLIC',
      eventDate: { $gte: today },
    })
      .sort({ eventDate: 1 })
      .lean();

    if (!upcoming.length) return {};

    const formatEvent = (e, reason = null, matchScore = null) => ({
      ...e,
      id: e.id,
      eventName: e.eventName,
      eventDate: e.eventDate,
      ticketPrice: e.ticketPrice,
      availableSeats: e.availableSeats,
      totalSeats: e.totalSeats,
      category: e.category,
      eventType: e.eventType,
      venueName: e.venueName,
      location: e.location,
      eventBanner: e.eventBanner,
      reason,
      matchScore: matchScore !== null ? Math.round(matchScore) : undefined,
    });

    const result = {};

    result['ALL_LIVE_EVENTS'] = upcoming.slice(0, 48).map((e) => formatEvent(e, 'Open for registration'));

    // 1. Trending (fastest filling seats or bookings)
    const trending = [...upcoming]
      .sort((a, b) => (b.totalSeats - b.availableSeats) - (a.totalSeats - a.availableSeats))
      .slice(0, 8);
    result['TRENDING'] = trending.map((e) => formatEvent(e, 'High student interest'));

    // 2. Upcoming this week
    const weekEnd = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    const thisWeek = upcoming.filter((e) => new Date(e.eventDate) <= weekEnd).slice(0, 8);
    result['UPCOMING_THIS_WEEK'] = thisWeek.map((e) => formatEvent(e, 'Happening this week'));

    // 3. Recently added
    const recent = [...upcoming]
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .slice(0, 12);
    result['RECENTLY_ADDED'] = recent.map((e) => formatEvent(e, 'New event'));

    // 4. Free events
    const freeEvents = upcoming.filter((e) => Number(e.ticketPrice || 0) === 0).slice(0, 8);
    result['FREE_EVENTS'] = freeEvents.map((e) => formatEvent(e, 'Free entry'));

    // 5. Popular
    const popular = [...upcoming]
      .sort((a, b) => {
        const fillA = a.totalSeats > 0 ? (a.totalSeats - a.availableSeats) / a.totalSeats : 0;
        const fillB = b.totalSeats > 0 ? (b.totalSeats - b.availableSeats) / b.totalSeats : 0;
        return fillB - fillA;
      })
      .slice(0, 8);
    result['POPULAR'] = popular.map((e) => formatEvent(e, 'Trending registration rate'));

    // User-specific
    if (userId) {
      const numUserId = Number(userId);
      const userBookings = await Booking.find({ userId: numUserId }).select('eventId').lean();
      const bookedEventIds = new Set(userBookings.map((b) => b.eventId));
      const candidates = upcoming.filter((e) => !bookedEventIds.has(e.id));

      const interest = await UserInterest.findOne({ userId: numUserId }).lean();

      // Recommended for you
      const scoredCandidates = candidates.map((e) => {
        let score = 50;
        let matchReason = 'Recommended for you';

        if (interest) {
          const userCats = (interest.favoriteCategories || '').toLowerCase();
          const userSkills = (interest.skills || '').toLowerCase();
          const userInterests = (interest.interests || '').toLowerCase();
          const evCat = (e.category || '').toLowerCase();
          const evDesc = (e.description || '').toLowerCase();
          const evTags = (e.tags || '').toLowerCase();

          if (userCats && userCats.includes(evCat)) {
            score += 30;
            matchReason = `Matches your interest in ${e.category}`;
          }
          if (userSkills && (evDesc.includes(userSkills) || evTags.includes(userSkills))) {
            score += 15;
          }
          if (userInterests && (evDesc.includes(userInterests) || evTags.includes(userInterests))) {
            score += 10;
          }
          if (interest.department && e.departmentName && e.departmentName.toLowerCase() === interest.department.toLowerCase()) {
            score += 20;
            matchReason = `Matches your department (${interest.department})`;
          }
        }

        return formatEvent(e, matchReason, Math.min(score, 99));
      });

      scoredCandidates.sort((a, b) => b.matchScore - a.matchScore);

      result['RECOMMENDED_FOR_YOU'] = scoredCandidates.slice(0, 8);
      result['AI_PICKS'] = scoredCandidates.slice(0, 6).map((e) => ({
        ...e,
        reason: `AI Match: ${e.reason || 'Curated for your profile'}`,
      }));

      if (interest?.department) {
        const deptEvents = candidates
          .filter((e) => e.departmentName && e.departmentName.toLowerCase() === interest.department.toLowerCase())
          .slice(0, 8);
        result['POPULAR_IN_DEPARTMENT'] = deptEvents.map((e) =>
          formatEvent(e, `Matches your department: ${interest.department}`)
        );
      }

      if (interest?.college) {
        const collegeEvents = candidates
          .filter((e) => e.collegeName && e.collegeName.toLowerCase() === interest.college.toLowerCase())
          .slice(0, 8);
        result['POPULAR_IN_COLLEGE'] = collegeEvents.map((e) => formatEvent(e, 'From your college'));
      }
    }

    // Near you (if location provided)
    if (userLat != null && userLon != null) {
      const lat = Number(userLat);
      const lon = Number(userLon);
      const withDistance = upcoming
        .filter((e) => e.venueLatitude != null && e.venueLongitude != null)
        .map((e) => {
          const dLat = (e.venueLatitude - lat) * (Math.PI / 180);
          const dLon = (e.venueLongitude - lon) * (Math.PI / 180);
          const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat * (Math.PI / 180)) *
              Math.cos(e.venueLatitude * (Math.PI / 180)) *
              Math.sin(dLon / 2) *
              Math.sin(dLon / 2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          const distanceKm = 6371 * c;
          return {
            ...formatEvent(e, `${distanceKm.toFixed(1)} km away`),
            distanceKm,
          };
        })
        .sort((a, b) => a.distanceKm - b.distanceKm)
        .slice(0, 8);

      if (withDistance.length) {
        result['NEAR_YOU'] = withDistance;
      }
    }

    return result;
  }

  static async getOrCreateInterest(userId) {
    let interest = await UserInterest.findOne({ userId: Number(userId) });
    if (!interest) {
      const user = await User.findOne({ id: Number(userId) });
      interest = new UserInterest({
        userId: Number(userId),
        user: user?._id,
        department: user?.department || null,
        college: user?.college || null,
      });
      await interest.save();
    }
    return interest;
  }

  static async updateInterest(userId, data) {
    let interest = await UserInterest.findOne({ userId: Number(userId) });
    if (!interest) {
      const user = await User.findOne({ id: Number(userId) });
      interest = new UserInterest({
        userId: Number(userId),
        user: user?._id,
      });
    }

    if (data.skills !== undefined) interest.skills = data.skills;
    if (data.interests !== undefined) interest.interests = data.interests;
    if (data.department !== undefined) interest.department = data.department;
    if (data.college !== undefined) interest.college = data.college;
    if (data.yearOfStudy !== undefined) interest.yearOfStudy = data.yearOfStudy;
    if (data.favoriteCategories !== undefined) interest.favoriteCategories = data.favoriteCategories;
    if (data.preferredEventType !== undefined) interest.preferredEventType = data.preferredEventType;
    if (data.careerGoal !== undefined) interest.careerGoal = data.careerGoal;

    await interest.save();
    return interest;
  }
}

export default RecommendationService;
