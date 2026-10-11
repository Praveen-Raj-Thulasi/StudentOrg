import { AgentTool } from './agentTool.interface.js';
import { Event } from '../../models/Event.js';
import { UserInterest } from '../../models/UserInterest.js';

export class RecommendationTool extends AgentTool {
  name() {
    return 'recommendationTool';
  }

  description() {
    return 'Generates personalized event recommendations: trending, AI picks, recommended for you, free events, upcoming this week.';
  }

  async execute(input = {}, principal = null) {
    try {
      const today = new Date().toISOString().split('T')[0];
      const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

      const upcoming = await Event.find({
        status: 'PUBLISHED',
        eventDate: { $gte: today },
      })
        .sort({ eventDate: 1 })
        .limit(30)
        .lean();

      // Categories of user interest if available
      let preferredCategories = [];
      if (principal?.id) {
        const interests = await UserInterest.find({ userId: principal.id }).lean();
        preferredCategories = interests.map((i) => i.category?.toLowerCase());
      }

      const recommendedForYou = upcoming
        .filter((e) =>
          preferredCategories.length > 0
            ? preferredCategories.includes(e.category?.toLowerCase())
            : true
        )
        .slice(0, 5)
        .map(this._mapEvent);

      const trending = upcoming
        .slice()
        .sort((a, b) => (b.totalSeats - b.availableSeats) - (a.totalSeats - a.availableSeats))
        .slice(0, 5)
        .map(this._mapEvent);

      const upcomingThisWeek = upcoming
        .filter((e) => e.eventDate <= nextWeek)
        .slice(0, 5)
        .map(this._mapEvent);

      const freeEvents = upcoming
        .filter((e) => !e.ticketPrice || Number(e.ticketPrice) === 0)
        .slice(0, 4)
        .map(this._mapEvent);

      return {
        recommendedForYou,
        trending,
        upcomingThisWeek,
        freeEvents,
        personalised: Boolean(principal?.id && preferredCategories.length > 0),
      };
    } catch (err) {
      return { error: `Could not load recommendations: ${err.message}` };
    }
  }

  _mapEvent(e) {
    return {
      id: e.id,
      eventName: e.eventName,
      category: e.category,
      eventDate: e.eventDate,
      venueName: e.venueName,
      ticketPrice: e.ticketPrice,
      availableSeats: e.availableSeats,
    };
  }
}

export const recommendationTool = new RecommendationTool();
export default recommendationTool;
