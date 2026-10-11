import { AgentTool } from './agentTool.interface.js';
import { Event } from '../../models/Event.js';

export class EventTool extends AgentTool {
  name() {
    return 'eventTool';
  }

  description() {
    return "Fetches upcoming events, event details by ID, organizer's own events, and event seat/schedule info.";
  }

  async execute(input = {}, principal = null) {
    try {
      const eventId = input.eventId ? Number(input.eventId) : null;
      if (eventId) {
        const evt = await Event.findOne({ id: eventId }).lean();
        if (!evt) {
          return { error: 'Event not found' };
        }
        return this._mapEvent(evt);
      }

      const isOrganizer = principal?.role?.toUpperCase() === 'ORGANIZER';
      if (isOrganizer && principal?.id) {
        const events = await Event.find({ organizerId: principal.id })
          .sort({ createdAt: -1 })
          .limit(20)
          .lean();

        return {
          myEvents: events.map(this._mapEvent),
          count: events.length,
        };
      }

      // Public upcoming events
      const today = new Date().toISOString().split('T')[0];
      const query = {
        status: 'PUBLISHED',
        eventDate: { $gte: today },
      };

      if (input.category && typeof input.category === 'string') {
        query.category = { $regex: new RegExp(`^${input.category}$`, 'i') };
      }

      let events = await Event.find(query).sort({ eventDate: 1 }).limit(20).lean();

      if (input.keyword && typeof input.keyword === 'string') {
        const kw = input.keyword.toLowerCase();
        events = events.filter((e) => {
          return (
            e.eventName?.toLowerCase().includes(kw) ||
            e.tags?.toLowerCase().includes(kw) ||
            e.category?.toLowerCase().includes(kw) ||
            e.description?.toLowerCase().includes(kw)
          );
        });
      }

      const mapped = events.slice(0, 10).map(this._mapEvent);
      return {
        events: mapped,
        count: mapped.length,
      };
    } catch (err) {
      return { error: `Could not fetch events: ${err.message}` };
    }
  }

  _mapEvent(e) {
    return {
      id: e.id,
      eventName: e.eventName,
      category: e.category,
      eventType: e.eventType,
      eventDate: e.eventDate,
      eventTime: e.eventTime,
      venueName: e.venueName,
      location: e.location,
      ticketPrice: e.ticketPrice,
      availableSeats: e.availableSeats,
      totalSeats: e.totalSeats,
      status: e.status,
      collegeName: e.collegeName,
      departmentName: e.departmentName,
      hasCertificate: Boolean(e.hasCertificate),
      eventBanner: e.eventBanner,
    };
  }
}

export const eventTool = new EventTool();
export default eventTool;
