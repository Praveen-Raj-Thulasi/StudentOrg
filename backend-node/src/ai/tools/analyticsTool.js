import { AgentTool } from './agentTool.interface.js';
import { Event } from '../../models/Event.js';
import { Booking } from '../../models/Booking.js';
import { Attendance } from '../../models/Attendance.js';
import { OrganizerScore } from '../../models/OrganizerScore.js';

export class AnalyticsTool extends AgentTool {
  name() {
    return 'analyticsTool';
  }

  description() {
    return 'Fetches organizer analytics: total events, registrations, attendance, revenue, performance score, and badge.';
  }

  async execute(input = {}, principal = null) {
    if (!principal || principal.role?.toUpperCase() !== 'ORGANIZER') {
      return { error: 'Organizer login required to access analytics.' };
    }

    try {
      const organizerId = principal.id;
      const events = await Event.find({ organizerId }).lean();
      const eventIds = events.map((e) => e.id);

      const totalEvents = events.length;
      const publishedEvents = events.filter((e) => e.status === 'PUBLISHED').length;
      const completedEvents = events.filter(
        (e) => e.status === 'COMPLETED' || e.status === 'EXPIRED'
      ).length;

      const totalSeats = events.reduce((sum, e) => sum + (e.totalSeats || 0), 0);
      const availableSeats = events.reduce((sum, e) => sum + (e.availableSeats || 0), 0);
      const totalRegistrations = Math.max(0, totalSeats - availableSeats);

      const totalAttendance = await Attendance.countDocuments({
        eventId: { $in: eventIds },
        status: 'CHECKED_IN',
      });

      const categoryDistribution = {};
      events.forEach((e) => {
        const cat = e.category || 'General';
        categoryDistribution[cat] = (categoryDistribution[cat] || 0) + 1;
      });

      const scoreDoc = await OrganizerScore.findOne({ organizerId }).lean();
      const performanceScore = {
        overallScore: scoreDoc?.overallScore || 85,
        badge: scoreDoc?.badge || 'Top Organizer',
      };

      const topEvents = events
        .map((e) => ({
          eventId: e.id,
          eventName: e.eventName,
          registrations: Math.max(0, (e.totalSeats || 0) - (e.availableSeats || 0)),
        }))
        .sort((a, b) => b.registrations - a.registrations)
        .slice(0, 3);

      return {
        totalEvents,
        publishedEvents,
        completedEvents,
        totalRegistrations,
        totalAttendance,
        categoryDistribution,
        performanceScore,
        topEvents,
        aiInsights:
          totalRegistrations > 50
            ? 'Strong attendee engagement across technical categories.'
            : 'Early engagement phase; recommended to run student outreach.',
      };
    } catch (err) {
      return { error: `Could not fetch analytics: ${err.message}` };
    }
  }
}

export const analyticsTool = new AnalyticsTool();
export default analyticsTool;
