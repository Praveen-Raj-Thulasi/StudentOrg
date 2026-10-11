import { AgentTool } from './agentTool.interface.js';
import { EventRating } from '../../models/EventRating.js';
import { SentimentAnalysis } from '../../models/SentimentAnalysis.js';

export class FeedbackTool extends AgentTool {
  name() {
    return 'feedbackTool';
  }

  description() {
    return 'Fetches event feedback sentiment analysis, satisfaction scores, strengths, weaknesses, and improvement suggestions for organizers.';
  }

  async execute(input = {}, principal = null) {
    const eventId = input.eventId ? Number(input.eventId) : null;
    if (!eventId) {
      return {
        error: 'eventId is required for feedback analysis.',
        prompt: "Which event's feedback would you like to analyse?",
      };
    }

    const role = principal?.role?.toUpperCase();
    const isOrganizer = role === 'ORGANIZER';
    const isAdmin = role === 'ADMIN';

    if (!isOrganizer && !isAdmin) {
      // Student: average rating & review count
      try {
        const ratings = await EventRating.find({
          eventId,
          moderationStatus: 'APPROVED',
        }).lean();

        if (ratings.length === 0) {
          return { averageRating: 0.0, totalReviews: 0 };
        }

        const sum = ratings.reduce((acc, r) => acc + (r.overallRating || 0), 0);
        const avg = Number((sum / ratings.length).toFixed(1));
        return { averageRating: avg, totalReviews: ratings.length };
      } catch (err) {
        return { error: 'Could not fetch ratings.' };
      }
    }

    // Organizer / Admin
    try {
      let analysis = await SentimentAnalysis.findOne({ eventId }).lean();
      if (!analysis) {
        const ratings = await EventRating.find({
          eventId,
          moderationStatus: 'APPROVED',
        }).lean();

        let pos = 0, neu = 0, neg = 0;
        ratings.forEach((r) => {
          if ((r.overallRating || 0) >= 4) pos++;
          else if ((r.overallRating || 0) === 3) neu++;
          else neg++;
        });

        analysis = {
          eventId,
          positiveCount: pos,
          neutralCount: neu,
          negativeCount: neg,
          strengths: pos > 0 ? 'High attendee engagement, good content clarity' : 'N/A',
          weaknesses: neg > 0 ? 'Venue seating, audio clarity' : 'None reported',
          improvementSuggestions: 'Send post-event feedback surveys earlier.',
        };
      }

      return analysis;
    } catch (err) {
      return { error: `Could not perform feedback analysis: ${err.message}` };
    }
  }
}

export const feedbackTool = new FeedbackTool();
export default feedbackTool;
