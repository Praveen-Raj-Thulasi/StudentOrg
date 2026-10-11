import EventRating from '../models/EventRating.js';
import Event from '../models/Event.js';
import Booking from '../models/Booking.js';
import Attendance from '../models/Attendance.js';
import User from '../models/User.js';
import SentimentAnalysis from '../models/SentimentAnalysis.js';
import { AppError, NotFoundError, ConflictError } from '../utils/errors.js';

export class RatingService {
  static async submitRating(userId, eventId, data) {
    const event = await Event.findOne({ id: Number(eventId) });
    if (!event) throw new NotFoundError('Event not found');

    const now = new Date();
    const eventDate = new Date(event.eventDate);
    const eventEnded = eventDate < now;
    if (!eventEnded) {
      throw new AppError('Feedback opens only after the event has completed', 400);
    }

    const booking = await Booking.findOne({
      userId: Number(userId),
      eventId: Number(eventId),
      bookingStatus: 'CONFIRMED',
    });
    if (!booking) {
      throw new AppError('Only registered participants can review this event', 403);
    }

    const attended = await Attendance.exists({
      $or: [
        { bookingId: booking.id },
        { eventId: Number(eventId), userId: Number(userId) },
      ],
    });
    if (!attended) {
      throw new AppError('Only QR verified attendees can review this event', 403);
    }

    const existing = await EventRating.findOne({
      userId: Number(userId),
      eventId: Number(eventId),
    });
    if (existing) {
      throw new ConflictError('You have already submitted a review for this event');
    }

    const user = await User.findOne({ id: Number(userId) });

    const rating = new EventRating({
      eventId: Number(eventId),
      event: event._id,
      userId: Number(userId),
      user: user?._id,
      bookingId: booking.id,
      booking: booking._id,
      overallRating: data.overallRating,
      speakerRating: data.speakerRating || null,
      venueRating: data.venueRating || null,
      foodRating: data.foodRating || null,
      organizationRating: data.organizationRating || null,
      timeManagementRating: data.timeManagementRating || null,
      contentQualityRating: data.contentQualityRating || null,
      valueForMoneyRating: data.valueForMoneyRating || null,
      accommodationRating: data.accommodationRating || null,
      eventQualityRating: data.eventQualityRating || null,
      reviewText: data.reviewText || null,
      suggestions: data.suggestions || null,
      anonymous: Boolean(data.anonymous),
      isVerifiedAttendance: true,
      moderationStatus: 'APPROVED',
    });

    await rating.save();
    return rating;
  }

  static async updateRating(userId, eventId, data) {
    const rating = await EventRating.findOne({
      userId: Number(userId),
      eventId: Number(eventId),
    });
    if (!rating) throw new NotFoundError('Review not found');

    const createdTime = new Date(rating.createdAt).getTime();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    if (Date.now() - createdTime > sevenDaysMs) {
      throw new AppError('Reviews can be edited for 7 days only', 400);
    }

    if (data.overallRating !== undefined) rating.overallRating = data.overallRating;
    if (data.speakerRating !== undefined) rating.speakerRating = data.speakerRating;
    if (data.venueRating !== undefined) rating.venueRating = data.venueRating;
    if (data.foodRating !== undefined) rating.foodRating = data.foodRating;
    if (data.organizationRating !== undefined) rating.organizationRating = data.organizationRating;
    if (data.eventQualityRating !== undefined) rating.eventQualityRating = data.eventQualityRating;
    if (data.accommodationRating !== undefined) rating.accommodationRating = data.accommodationRating;
    if (data.contentQualityRating !== undefined) rating.contentQualityRating = data.contentQualityRating;
    if (data.valueForMoneyRating !== undefined) rating.valueForMoneyRating = data.valueForMoneyRating;
    if (data.reviewText !== undefined) rating.reviewText = data.reviewText;
    if (data.suggestions !== undefined) rating.suggestions = data.suggestions;
    if (data.anonymous !== undefined) rating.anonymous = Boolean(data.anonymous);

    await rating.save();
    return rating;
  }

  static async getFeedbackEligibility(userId, eventId) {
    const event = await Event.findOne({ id: Number(eventId) });
    if (!event) throw new NotFoundError('Event not found');

    const booking = await Booking.findOne({
      userId: Number(userId),
      eventId: Number(eventId),
      bookingStatus: 'CONFIRMED',
    });
    const registered = Boolean(booking);

    const attended = registered
      ? Boolean(
          await Attendance.exists({
            $or: [
              { bookingId: booking.id },
              { eventId: Number(eventId), userId: Number(userId) },
            ],
          })
        )
      : false;

    const eventDate = new Date(event.eventDate);
    const eventEnded = eventDate < new Date();

    const review = await EventRating.findOne({
      userId: Number(userId),
      eventId: Number(eventId),
    });

    let canEdit = false;
    let editDeadline = null;
    if (review && review.createdAt) {
      const deadline = new Date(new Date(review.createdAt).getTime() + 7 * 24 * 60 * 60 * 1000);
      canEdit = deadline > new Date();
      editDeadline = deadline.toISOString();
    }

    const canSubmit = registered && attended && eventEnded && !review;

    return {
      registered,
      attended,
      eventEnded,
      hasReview: Boolean(review),
      canSubmit,
      canEdit,
      editDeadline,
    };
  }

  static async getEventRatings(eventId, page = 0, size = 10) {
    const skip = Number(page) * Number(size);
    const limit = Number(size);

    const [ratings, total] = await Promise.all([
      EventRating.find({
        eventId: Number(eventId),
        moderationStatus: 'APPROVED',
      })
        .populate('user', 'name profilePicture department')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      EventRating.countDocuments({
        eventId: Number(eventId),
        moderationStatus: 'APPROVED',
      }),
    ]);

    const content = ratings.map((r) => ({
      id: r.id,
      overallRating: r.overallRating,
      speakerRating: r.speakerRating,
      venueRating: r.venueRating,
      foodRating: r.foodRating,
      organizationRating: r.organizationRating,
      reviewText: r.reviewText,
      suggestions: r.suggestions,
      anonymous: r.anonymous,
      createdAt: r.createdAt,
      authorName: r.anonymous ? 'Anonymous Attendee' : r.user?.name || 'Verified Attendee',
      userDepartment: r.anonymous ? null : r.user?.department || null,
      userPicture: r.anonymous ? null : r.user?.profilePicture || null,
    }));

    return {
      content,
      page: Number(page),
      size: limit,
      totalElements: total,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  static async getEventRatingSummary(eventId) {
    const ratings = await EventRating.find({
      eventId: Number(eventId),
      moderationStatus: 'APPROVED',
    }).populate('user', 'name');

    if (!ratings.length) {
      return {
        averageRating: 0.0,
        totalReviews: 0,
        ratingDistribution: {},
        categoryAverages: {},
        positiveComments: [],
        improvementSuggestionsList: [],
      };
    }

    const totalReviews = ratings.length;
    const avg = ratings.reduce((sum, r) => sum + r.overallRating, 0) / totalReviews;
    const averageRating = Math.round(avg * 10) / 10;

    const ratingDistribution = {};
    for (let i = 1; i <= 5; i++) ratingDistribution[i] = 0;
    for (const r of ratings) {
      ratingDistribution[r.overallRating] = (ratingDistribution[r.overallRating] || 0) + 1;
    }

    const calcCatAvg = (key) => {
      const vals = ratings.map((r) => r[key]).filter((v) => typeof v === 'number');
      if (!vals.length) return 0;
      return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
    };

    const categoryAverages = {
      eventQuality: calcCatAvg('eventQualityRating'),
      speaker: calcCatAvg('speakerRating'),
      venue: calcCatAvg('venueRating'),
      organization: calcCatAvg('organizationRating'),
      food: calcCatAvg('foodRating'),
      accommodation: calcCatAvg('accommodationRating'),
    };

    const positiveComments = ratings
      .filter((r) => r.overallRating >= 4 && r.reviewText)
      .slice(0, 5)
      .map((r) => ({
        comment: r.reviewText,
        author: r.anonymous ? 'Anonymous Attendee' : r.user?.name || 'Verified Attendee',
      }));

    const improvementSuggestionsList = ratings
      .filter((r) => r.suggestions)
      .slice(0, 5)
      .map((r) => ({
        suggestion: r.suggestions,
        author: r.anonymous ? 'Anonymous Attendee' : r.user?.name || 'Verified Attendee',
      }));

    const sentiment = await SentimentAnalysis.findOne({ eventId: Number(eventId) });

    return {
      averageRating,
      totalReviews,
      ratingDistribution,
      categoryAverages,
      positiveComments,
      improvementSuggestionsList,
      satisfactionScore: sentiment?.satisfactionScore || null,
      strengths: sentiment?.strengths || null,
      weaknesses: sentiment?.weaknesses || null,
      improvementSuggestions: sentiment?.improvementSuggestions || null,
      aiTestimonial: sentiment?.aiTestimonial || null,
    };
  }

  static async getUserReview(userId, eventId) {
    return EventRating.findOne({
      userId: Number(userId),
      eventId: Number(eventId),
    });
  }

  static async moderateReview(ratingId, status, note) {
    const rating = await EventRating.findOne({ id: Number(ratingId) });
    if (!rating) throw new NotFoundError('Review not found');

    rating.moderationStatus = status;
    if (note) rating.moderationNote = note;
    await rating.save();
    return rating;
  }
}

export default RatingService;
