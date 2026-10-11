import { AgentTool } from './agentTool.interface.js';
import { Event } from '../../models/Event.js';
import { Booking } from '../../models/Booking.js';

export class DashboardTool extends AgentTool {
  name() {
    return 'dashboardTool';
  }

  description() {
    return 'Returns a quick dashboard summary: organizer sees event count + top metrics; students see upcoming events count and recent activity.';
  }

  async execute(input = {}, principal = null) {
    try {
      const isOrganizer = principal?.role?.toUpperCase() === 'ORGANIZER';

      if (isOrganizer && principal?.id) {
        const events = await Event.find({ organizerId: principal.id })
          .sort({ createdAt: -1 })
          .limit(50)
          .lean();

        const published = events.filter((e) => e.status === 'PUBLISHED').length;
        const completed = events.filter(
          (e) => e.status === 'COMPLETED' || e.status === 'EXPIRED'
        ).length;
        const pending = events.filter((e) => e.status === 'PENDING_APPROVAL').length;

        const totalSeats = events.reduce((sum, e) => sum + (e.totalSeats || 0), 0);
        const availableSeats = events.reduce((sum, e) => sum + (e.availableSeats || 0), 0);
        const totalRegistrations = Math.max(0, totalSeats - availableSeats);

        const recentEvents = events.slice(0, 5).map((e) => ({
          id: e.id,
          eventName: e.eventName,
          status: e.status,
          eventDate: e.eventDate,
          registrations: Math.max(0, (e.totalSeats || 0) - (e.availableSeats || 0)),
        }));

        return {
          totalEvents: events.length,
          publishedEvents: published,
          completedEvents: completed,
          pendingApproval: pending,
          totalRegistrations,
          recentEvents,
        };
      }

      // Student / Guest
      const today = new Date().toISOString().split('T')[0];
      const upcomingEventsCount = await Event.countDocuments({
        status: 'PUBLISHED',
        eventDate: { $gte: today },
      });

      let myTotalBookings = 0;
      if (principal?.id) {
        myTotalBookings = await Booking.countDocuments({ userId: principal.id });
      }

      return {
        upcomingEventsCount,
        myTotalBookings,
        quickLinks: [
          { label: 'Browse Events', path: '/events' },
          { label: 'My Bookings', path: '/bookings' },
          { label: 'My Certificates', path: '/certificates' },
        ],
      };
    } catch (err) {
      return { error: `Could not load dashboard: ${err.message}` };
    }
  }
}

export const dashboardTool = new DashboardTool();
export default dashboardTool;
