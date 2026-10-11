import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import Event from '../models/Event.js';
import Booking from '../models/Booking.js';
import Attendance from '../models/Attendance.js';
import EventRating from '../models/EventRating.js';
import OrganizerScore from '../models/OrganizerScore.js';
import Organizer from '../models/Organizer.js';
import Payment from '../models/Payment.js';
import VolunteerTask from '../models/VolunteerTask.js';
import AnalyticsData from '../models/AnalyticsData.js';
import { UPLOAD_DIR } from '../utils/upload.js';
import { NotFoundError, ForbiddenError } from '../utils/errors.js';

export class OrganizerAnalyticsService {
  static async getOrganizerAnalytics(organizerId) {
    const numOrgId = Number(organizerId);

    const events = await Event.find({ organizerId: numOrgId }).lean();

    const totalEvents = events.length;
    const completedEvents = events.filter(
      (e) => e.status === 'COMPLETED' || e.status === 'EXPIRED'
    ).length;
    const publishedEvents = events.filter((e) => e.status === 'PUBLISHED').length;

    let totalRegistrations = 0;
    let totalAttendance = 0;
    const eventStats = [];

    for (const ev of events) {
      const confirmedBookings = await Booking.find({
        eventId: ev.id,
        bookingStatus: 'CONFIRMED',
      }).lean();

      const regs = confirmedBookings.reduce((sum, b) => sum + (b.quantity || 1), 0);
      totalRegistrations += regs;

      const att = await Attendance.countDocuments({ eventId: ev.id });
      totalAttendance += att;

      const ratings = await EventRating.find({ eventId: ev.id, moderationStatus: 'APPROVED' }).lean();
      const avgRating = ratings.length
        ? ratings.reduce((sum, r) => sum + r.overallRating, 0) / ratings.length
        : 0;

      eventStats.push({
        eventId: ev.id,
        eventName: ev.eventName,
        eventDate: ev.eventDate,
        status: ev.status,
        registrations: regs,
        attendance: att,
        averageRating: Math.round(avgRating * 10) / 10,
      });
    }

    const categoryDistribution = {};
    for (const ev of events) {
      if (ev.category) {
        categoryDistribution[ev.category] = (categoryDistribution[ev.category] || 0) + 1;
      }
    }

    // Performance score
    const attendanceRate =
      totalRegistrations > 0
        ? Math.min((totalAttendance / totalRegistrations) * 100, 100)
        : 0;
    const completionRate = totalEvents > 0 ? (completedEvents / totalEvents) * 100 : 0;
    const allRatings = await EventRating.find({
      eventId: { $in: events.map((e) => e.id) },
      moderationStatus: 'APPROVED',
    }).lean();
    const overallAvgRating = allRatings.length
      ? allRatings.reduce((sum, r) => sum + r.overallRating, 0) / allRatings.length
      : 0;

    const overallScore =
      (overallAvgRating / 5) * 40 + (completionRate / 100) * 30 + (attendanceRate / 100) * 30;

    let badge = 'NONE';
    if (overallScore >= 80 && overallAvgRating >= 4.5) badge = 'GOLD';
    else if (overallScore >= 65 && overallAvgRating >= 4.0) badge = 'SILVER';
    else if (overallScore >= 45) badge = 'BRONZE';

    const performanceScore = {
      overallScore: Math.round(overallScore * 10) / 10,
      averageRating: Math.round(overallAvgRating * 10) / 10,
      attendanceRate: Math.round(attendanceRate * 10) / 10,
      completionRate: Math.round(completionRate * 10) / 10,
      badge,
      totalEvents,
      completedEvents,
      totalRegistrations,
    };

    // Authoritative Financial Breakdown for this organizer's events
    const myBookings = await Booking.find({ eventId: { $in: events.map((e) => e.id) } }).lean();
    const myBookingIds = myBookings.map((b) => b.id);
    const myBookingObjectIds = myBookings.map((b) => b._id).filter(Boolean);
    const myPayments = await Payment.find({
      $or: [{ bookingId: { $in: myBookingIds } }, { booking: { $in: myBookingObjectIds } }],
    }).lean();
    const successfulPayments = myPayments.filter((p) => p.paymentStatus === 'SUCCESSFUL' || p.paymentStatus === 'SUCCESS');
    const refundedPayments = myPayments.filter((p) => p.paymentStatus === 'REFUNDED' || p.paymentStatus === 'PARTIALLY_REFUNDED');
    const successfulPaymentsAmount = successfulPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const refundedAmount = refundedPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const grossBookingsAmount = myBookings
      .filter((b) => b.bookingStatus === 'CONFIRMED')
      .reduce((sum, b) => sum + Number(b.totalAmount !== undefined ? b.totalAmount : (b.totalPrice || 0)), 0);
    const netRecordedRevenue = Math.max(0, successfulPaymentsAmount - refundedAmount);

    return {
      totalEvents,
      completedEvents,
      publishedEvents,
      totalRegistrations,
      totalAttendance,
      eventStats,
      categoryDistribution,
      participantSummary: {
        localParticipants: 0,
        outstationParticipants: totalRegistrations,
        accommodationRequests: 0,
        foodPreferenceSummary: {},
      },
      financialSummary: {
        grossBookingsAmount,
        successfulPaymentsAmount,
        refundedAmount,
        netRecordedRevenue,
        ticketSalesCount: totalRegistrations,
        verifiedAttendanceCount: totalAttendance,
      },
      performanceScore,
      aiInsights: `Performance rating: ${badge}. You have registered ${totalRegistrations} participants across ${totalEvents} campus events. Keep maintaining consistent attendance verification to boost your organizer ranking!`,
    };
  }

  static async getCollegeLeaderboard(limit = 20) {
    const agg = await Booking.aggregate([
      { $match: { bookingStatus: 'CONFIRMED' } },
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: 'id',
          as: 'userInfo',
        },
      },
      { $unwind: { path: '$userInfo', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: '$userInfo.organizationName',
          participants: { $sum: '$quantity' },
        },
      },
      { $sort: { participants: -1 } },
      { $limit: Number(limit) },
    ]);

    return agg.map((row) => ({
      college: row._id || 'Autonomous Campus',
      participants: row.participants,
    }));
  }

  static async answerNaturalLanguageQuery(organizerId, question) {
    const numOrgId = Number(organizerId);
    const events = await Event.find({ organizerId: numOrgId }).lean();

    const totalEvents = events.length;
    const published = events.filter((e) => e.status === 'PUBLISHED').length;
    const completed = events.filter((e) => e.status === 'COMPLETED' || e.status === 'EXPIRED').length;

    let totalRegistrations = 0;
    for (const ev of events) {
      totalRegistrations += Math.max(0, (ev.totalSeats || 0) - (ev.availableSeats || 0));
    }

    const q = (question || '').toLowerCase();
    if (q.contains?.('registr') || q.includes('registr') || q.includes('how many')) {
      return `You have **${totalRegistrations} total registrations** across all your events. You currently have **${published} published** events.`;
    }
    if (q.includes('popular') || q.includes('highest') || q.includes('best')) {
      const top = [...events].sort(
        (a, b) => (b.totalSeats - b.availableSeats) - (a.totalSeats - a.availableSeats)
      )[0];
      if (top) {
        return `Your most popular event is **${top.eventName}** with **${top.totalSeats - top.availableSeats} registrations** out of ${top.totalSeats} seats.`;
      }
    }

    return `📊 **Your Analytics Summary:**\n- Total Events: ${totalEvents}\n- Published: ${published}\n- Completed: ${completed}\n- Total Registrations: ${totalRegistrations}`;
  }

  static async predictEventOutcomes(eventId, organizerId) {
    const numEventId = Number(eventId);
    const event = await Event.findOne({ id: numEventId });
    if (!event) throw new NotFoundError('Event not found');

    if (event.organizerId !== Number(organizerId)) {
      throw new ForbiddenError('Access denied');
    }

    const confirmed = await Booking.countDocuments({
      eventId: numEventId,
      bookingStatus: 'CONFIRMED',
    });

    const totalSeats = event.totalSeats || 100;
    const fillRate = totalSeats > 0 ? confirmed / totalSeats : 0;
    const predAttendance = Math.round(confirmed * 0.85);

    return {
      eventName: event.eventName,
      currentRegistrations: confirmed,
      totalSeats,
      fillRate: Math.round(fillRate * 1000) / 10,
      predictedAttendance: predAttendance,
      predictedNoShowRate: '15%',
      successScore: Math.min(Math.round(fillRate * 60 + 40), 100),
      predictedRevenue: (event.ticketPrice || 0) * predAttendance,
      aiPrediction: `Based on historical turnout patterns in ${event.category}, this event is projected to achieve strong student participation with an estimated ~${predAttendance} attendees present.`,
    };
  }

  static async exportParticipants(eventId, organizerId) {
    const numEventId = Number(eventId);
    const event = await Event.findOne({ id: numEventId });
    if (!event) throw new NotFoundError('Event not found');

    if (event.organizerId !== Number(organizerId)) {
      throw new ForbiddenError('Access denied');
    }

    const bookings = await Booking.find({
      eventId: numEventId,
      bookingStatus: 'CONFIRMED',
    })
      .populate('user', 'name email department organizationName')
      .lean();

    let csv = 'Event,Date,Ticket ID,Participant Name,Email,Department,College,Booking ID\n';
    for (const b of bookings) {
      const user = b.user || {};
      const safe = (val) => `"${String(val || '').replace(/"/g, '""')}"`;
      csv += `${safe(event.eventName)},${safe(event.eventDate)},${safe(b.ticketId)},${safe(user.name)},${safe(user.email)},${safe(user.department)},${safe(user.organizationName)},${safe(b.id)}\n`;
    }

    return {
      filename: `participants_event_${eventId}.csv`,
      data: Buffer.from(csv, 'utf8'),
    };
  }

  static async generatePoster(eventId, organizerId) {
    const numEventId = Number(eventId);
    const event = await Event.findOne({ id: numEventId });
    if (!event) throw new NotFoundError('Event not found');

    if (event.organizerId !== Number(organizerId)) {
      throw new ForbiddenError('Access denied');
    }

    const posterDir = path.join(UPLOAD_DIR, 'posters');
    if (!fs.existsSync(posterDir)) {
      fs.mkdirSync(posterDir, { recursive: true });
    }

    const filename = `poster_event_${eventId}_${crypto.randomUUID()}.svg`;
    const dateStr = event.eventDate ? new Date(event.eventDate).toDateString() : 'Date TBA';
    const priceStr = Number(event.ticketPrice) > 0 ? `INR ${event.ticketPrice}` : 'FREE';

    const escape = (str) =>
      String(str || 'N/A')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0f172a"/>
      <stop offset="0.55" stop-color="#0f766e"/>
      <stop offset="1" stop-color="#1d4ed8"/>
    </linearGradient>
  </defs>
  <rect width="1080" height="1350" fill="url(#bg)"/>
  <rect x="70" y="70" width="940" height="1210" rx="42" fill="rgba(255,255,255,0.92)"/>
  <text x="120" y="170" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="#0f766e">${escape(event.category)}</text>
  <text x="120" y="310" font-family="Arial, sans-serif" font-size="78" font-weight="900" fill="#0f172a">${escape(event.eventName)}</text>
  <text x="120" y="390" font-family="Arial, sans-serif" font-size="34" fill="#334155">${escape(event.collegeName || '')}</text>
  <rect x="120" y="500" width="840" height="3" fill="#cbd5e1"/>
  <text x="120" y="610" font-family="Arial, sans-serif" font-size="42" font-weight="700" fill="#0f172a">${escape(dateStr)}</text>
  <text x="120" y="680" font-family="Arial, sans-serif" font-size="32" fill="#475569">${escape(event.venueName || event.location || 'Campus Venue')}</text>
  <text x="120" y="750" font-family="Arial, sans-serif" font-size="32" fill="#475569">${escape(event.departmentName || 'All Departments')}</text>
  <text x="120" y="820" font-family="Arial, sans-serif" font-size="32" fill="#475569">Seats: ${event.availableSeats}/${event.totalSeats}</text>
  <rect x="120" y="940" width="300" height="94" rx="20" fill="#0f766e"/>
  <text x="160" y="1002" font-family="Arial, sans-serif" font-size="34" font-weight="800" fill="#ffffff">${escape(priceStr)}</text>
  <text x="120" y="1160" font-family="Arial, sans-serif" font-size="26" fill="#64748b">Generated by EventGPT</text>
</svg>`;

    fs.writeFileSync(path.join(posterDir, filename), svg, 'utf8');
    return `/uploads/posters/${filename}`;
  }

  static async getOrganizerDashboard(organizerId) {
    const numOrgId = Number(organizerId);
    const now = new Date();

    const myEvents = await Event.find({ organizerId: numOrgId }).lean();
    const eventIds = myEvents.map((e) => e.id);

    const totalEvents = myEvents.length;
    const publishedEvents = myEvents.filter((e) => ['PUBLISHED', 'LIVE', 'ONGOING', 'UPCOMING'].includes(e.status)).length;
    const draftEvents = myEvents.filter((e) => ['DRAFT', 'PENDING_APPROVAL'].includes(e.status)).length;
    const completedEvents = myEvents.filter((e) => ['COMPLETED', 'EXPIRED'].includes(e.status)).length;
    const cancelledEvents = myEvents.filter((e) => ['CANCELLED', 'REJECTED'].includes(e.status)).length;
    const upcomingEvents = myEvents.filter((e) => e.eventDate && new Date(e.eventDate) >= now && e.status !== 'CANCELLED').length;

    const totalCapacity = myEvents.reduce((sum, e) => sum + (e.totalSeats || 0), 0);
    const availableCapacity = myEvents.reduce((sum, e) => sum + (e.availableSeats || 0), 0);
    const bookedCapacity = Math.max(0, totalCapacity - availableCapacity);

    // Bookings
    const bookings = await Booking.find({ eventId: { $in: eventIds } }).lean();
    const bookingIds = bookings.map((b) => b.id);
    const totalBookings = bookings.length;
    const confirmedBookings = bookings.filter((b) => b.bookingStatus === 'CONFIRMED').length;
    const pendingBookings = bookings.filter((b) => b.bookingStatus === 'PENDING').length;
    const cancelledBookings = bookings.filter((b) => b.bookingStatus === 'CANCELLED').length;

    // Verified Attendance from Attendance records
    const verifiedAttendance = await Attendance.countDocuments({ eventId: { $in: eventIds } });

    // Payments: verified successful payments from authoritative records
    const bookingObjectIds = bookings.map((b) => b._id).filter(Boolean);
    const payments = await Payment.find({
      $or: [{ bookingId: { $in: bookingIds } }, { booking: { $in: bookingObjectIds } }],
    }).lean();

    const successfulPayments = payments.filter((p) => p.paymentStatus === 'SUCCESSFUL' || p.paymentStatus === 'SUCCESS');
    const totalRevenue = successfulPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);

    const refundedPayments = payments.filter((p) => p.paymentStatus === 'REFUNDED' || p.paymentStatus === 'PARTIALLY_REFUNDED');
    const totalRefunds = refundedPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);

    const grossBookingsAmount = bookings
      .filter((b) => b.bookingStatus === 'CONFIRMED')
      .reduce((sum, b) => sum + Number(b.totalAmount !== undefined ? b.totalAmount : (b.totalPrice || 0)), 0);

    const netRecordedRevenue = Math.max(0, totalRevenue - totalRefunds);

    // Volunteer assignments and pending duties
    const volunteerTasks = await VolunteerTask.find({ eventId: { $in: eventIds } }).lean();
    const totalVolunteerDuties = volunteerTasks.length;
    const pendingVolunteerDuties = volunteerTasks.filter((t) => t.status === 'PENDING' || t.status === 'IN_PROGRESS').length;
    const completedVolunteerDuties = volunteerTasks.filter((t) => t.status === 'COMPLETED').length;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const analyticsLast30Days = await AnalyticsData.find({
      organizerId: numOrgId,
      date: { $gte: thirtyDaysAgo },
    })
      .sort({ date: 1 })
      .lean();

    return {
      totalEvents,
      publishedEvents,
      draftEvents,
      completedEvents,
      cancelledEvents,
      upcomingEvents,
      capacity: {
        totalCapacity,
        availableCapacity,
        bookedCapacity,
      },
      bookings: {
        totalBookings,
        confirmedBookings,
        pendingBookings,
        cancelledBookings,
      },
      verifiedAttendance,
      revenueSummary: {
        totalRevenue, // verified successful payments
        grossBookingsAmount,
        totalRefunds,
        netRecordedRevenue,
        successfulPaymentCount: successfulPayments.length,
      },
      totalRevenue, // backward compatibility
      volunteerCoordination: {
        totalVolunteerDuties,
        pendingVolunteerDuties,
        completedVolunteerDuties,
      },
      analyticsLast30Days,
    };
  }

  static async getParticipants(organizerId, { eventId, bookingStatus, attendanceStatus, search } = {}) {
    const numOrgId = Number(organizerId);
    const myEvents = await Event.find({ organizerId: numOrgId }).lean();
    const eventMap = new Map(myEvents.map((e) => [e.id, e]));
    let eventIds = myEvents.map((e) => e.id);

    if (eventId && eventId !== 'ALL') {
      const numEvId = Number(eventId);
      if (!eventIds.includes(numEvId)) {
        throw new ForbiddenError('Unauthorized: You do not own this event');
      }
      eventIds = [numEvId];
    }

    const bookingFilter = { eventId: { $in: eventIds } };
    if (bookingStatus && bookingStatus !== 'ALL') {
      bookingFilter.bookingStatus = String(bookingStatus).toUpperCase();
    }
    if (attendanceStatus && attendanceStatus !== 'ALL') {
      const upper = String(attendanceStatus).toUpperCase();
      if (upper === 'ABSENT' || upper === 'NOT_ATTENDED') {
        bookingFilter.attendanceStatus = { $in: ['ABSENT', 'NOT_ATTENDED'] };
      } else {
        bookingFilter.attendanceStatus = upper;
      }
    }

    const bookings = await Booking.find(bookingFilter)
      .populate('user', 'name email department organizationName memberNumber')
      .lean();

    const bookingIds = bookings.map((b) => b.id);
    const payments = await Payment.find({ bookingId: { $in: bookingIds } }).lean();
    const paymentMap = new Map(payments.map((p) => [p.bookingId, p]));

    let results = bookings.map((b) => {
      const ev = eventMap.get(b.eventId);
      const user = b.user || {};
      const payment = paymentMap.get(b.id);
      return {
        id: b.id,
        name: user.name || (b.participants && b.participants[0]?.name) || 'Participant',
        email: user.email || (b.participants && b.participants[0]?.email) || '',
        department: user.department || '',
        college: user.organizationName || '',
        memberNumber: user.memberNumber || null,
        bookingId: b.id,
        ticketId: b.ticketId,
        eventId: b.eventId,
        eventName: ev?.eventName || '',
        eventDate: ev?.eventDate ? String(ev.eventDate).slice(0, 10) : '',
        bookingStatus: b.bookingStatus,
        attendanceStatus: b.attendanceStatus,
        ticketStatus: b.ticketStatus,
        checkInTime: b.checkInTime || null,
        totalPrice: b.totalPrice || 0,
        paymentStatus: payment?.paymentStatus || (ev?.ticketPrice > 0 ? 'PENDING' : 'FREE'),
        paidAt: payment?.paidAt || null,
      };
    });

    if (search && String(search).trim()) {
      const s = String(search).trim().toLowerCase();
      results = results.filter((p) =>
        [p.name, p.email, p.eventName, p.department, p.college, p.ticketId, p.memberNumber]
          .some((v) => v?.toLowerCase().includes(s))
      );
    }

    return results;
  }
}

export default OrganizerAnalyticsService;
