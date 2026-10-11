import { copilotController } from './copilot.controller.js';
import { Event } from '../models/Event.js';
import { Booking } from '../models/Booking.js';
import { aiEngine } from '../ai/engine/aiEngine.js';
import { eventGptPhaseService } from '../services/eventGptPhaseService.js';
import { ApiResponse } from '../utils/apiResponse.js';

export class AIController {
  async chat(req, res, next) {
    return copilotController.chat(req, res, next);
  }

  async nlpSearch(req, res, next) {
    try {
      const q = req.query.q || '';
      const today = new Date().toISOString().split('T')[0];
      const events = await Event.find({
        status: 'PUBLISHED',
        eventDate: { $gte: today },
      }).lean();

      if (!q.trim()) {
        return ApiResponse.success(res, events.slice(0, 10));
      }

      const terms = q.toLowerCase().split(/\s+/);
      const scored = events
        .map((e) => {
          const haystack = `${e.eventName} ${e.category} ${e.tags} ${e.description} ${e.collegeName}`.toLowerCase();
          let score = 0;
          for (const t of terms) {
            if (haystack.includes(t)) score += 1;
          }
          return { event: e, score };
        })
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((item) => item.event);

      return ApiResponse.success(res, scored.slice(0, 10));
    } catch (err) {
      next(err);
    }
  }

  async eventSummary(req, res, next) {
    try {
      const eventId = Number(req.params.eventId);
      const event = await Event.findOne({ id: eventId }).lean();
      if (!event) {
        return ApiResponse.error(res, 'Event not found', 404);
      }

      const summary = {
        eventId: event.id,
        eventName: event.eventName,
        targetAudience: `Students interested in ${event.category || 'technology and arts'}, engineering, and management departments.`,
        agendaHighlights: [
          'Registration & Networking Kickoff (09:00 AM)',
          'Keynote & Hands-on Interactive Session (10:30 AM)',
          'Project Showcase & Certificate Distribution (03:30 PM)',
        ],
        keyTakeaways: [
          'Hands-on practical experience with industry mentors',
          'Verified completion certificate for your academic portfolio',
          'Peer collaboration and campus networking opportunities',
        ],
        eligibility: 'Open to all college undergraduate and postgraduate students.',
      };

      return ApiResponse.success(res, summary);
    } catch (err) {
      next(err);
    }
  }

  async generateDescription(req, res, next) {
    try {
      const prompt = req.body?.prompt || '';
      const system =
        'You are an expert event copywriter. Return a structured description with an engaging summary, key takeaways, and agenda.';

      let text = await aiEngine.complete('DESCRIPTION', system, prompt);
      if (!text) {
        text = `## Event Overview\n${prompt}\n\n### Highlights\n- Deep dive sessions\n- Mentorship opportunities\n- Verified credentials upon completion`;
      }

      return ApiResponse.success(res, {
        prompt,
        description: text,
      });
    } catch (err) {
      next(err);
    }
  }

  async careerGuidance(req, res, next) {
    try {
      if (!req.user || !req.user.id) {
        return ApiResponse.success(res, 'Please log in for personalized career guidance.');
      }

      const bookings = await Booking.find({ userId: req.user.id })
        .populate('event', 'category eventName')
        .lean();

      const categories = bookings.map((b) => b.event?.category).filter(Boolean);
      const topCategory = categories[0] || 'Technical';

      const guidance =
        `Based on your participation in ${bookings.length} event(s) focusing on ${topCategory}:\n\n` +
        `1. **Focus Area**: Build a public portfolio showcasing projects from your workshops.\n` +
        `2. **Recommended Next Steps**: Join upcoming competitive hackathons and project symposiums.\n` +
        `3. **Certification**: Complete and download your verified certificates to share on LinkedIn.`;

      return ApiResponse.success(res, guidance);
    } catch (err) {
      next(err);
    }
  }

  async travelAssistant(req, res, next) {
    try {
      const data = await eventGptPhaseService.travelPlan(req.params.eventId);
      return ApiResponse.success(res, data);
    } catch (err) {
      next(err);
    }
  }
}

export const aiController = new AIController();
export default aiController;
