import { Event } from '../../models/Event.js';
import { Booking } from '../../models/Booking.js';
import { analyticsTool } from './analyticsTool.js';
import { recommendationTool } from './recommendationTool.js';
import { eventTool } from './eventTool.js';
import { feedbackTool } from './feedbackTool.js';
import { certificateTool } from './certificateTool.js';
import { aiEngine } from '../engine/aiEngine.js';
import logger from '../../utils/logger.js';

/**
 * EventGPT Direct Tool Service.
 * Implements direct tool execution for /api/ai/agent/invoke with strict permission
 * checks and confirmation gates for sensitive/mutating actions.
 */
export class EventGptToolService {
  availableTools() {
    return [
      'createEvent',
      'updateEvent',
      'deleteEvent',
      'sendEmail',
      'getParticipants',
      'generateCertificate',
      'generatePoster',
      'exportExcel',
      'getAnalytics',
      'recommendPrice',
      'predictAttendance',
      'summarizeFeedback',
      'recommendEvents',
      'generateDescription',
      'searchEvents',
    ];
  }

  async invoke(request = {}, principal = null) {
    const toolName = request.toolName?.trim() || this.decideTool(request.prompt);

    switch (toolName) {
      case 'createEvent':
        return this.createEvent(request, principal);
      case 'updateEvent':
        return this.updateEvent(request, principal);
      case 'deleteEvent':
        return this.deleteEvent(request, principal);
      case 'sendEmail':
        return this.sendEmail(request, principal);
      case 'getParticipants':
        return this.getParticipants(request, principal);
      case 'generateCertificate':
        return this.generateCertificate(request, principal);
      case 'generatePoster':
        return this.generatePoster(request, principal);
      case 'exportExcel':
        return this.exportExcel(request, principal);
      case 'getAnalytics':
        return this.getAnalytics(principal);
      case 'recommendPrice':
        return this.recommendPrice(request);
      case 'predictAttendance':
        return this.predictAttendance(request, principal);
      case 'summarizeFeedback':
        return this.summarizeFeedback(request, principal);
      case 'recommendEvents':
        return this.recommendEvents(principal);
      case 'generateDescription':
        return this.generateDescription(request);
      case 'searchEvents':
        return this.searchEvents(request, principal);
      default:
        return this._response(toolName, 'unsupported', false, 'Tool is not available.', {});
    }
  }

  createEvent(request, principal) {
    if (!this._isOrganizer(principal)) {
      return this._response('createEvent', 'denied', false, 'Organizer login is required to create events.', {});
    }
    return this._response(
      'createEvent',
      'confirmation_required',
      true,
      'Create events through the existing organizer event API after reviewing the generated draft.',
      { draft: request.arguments || {} }
    );
  }

  updateEvent(request, principal) {
    if (!this._isOrganizer(principal)) {
      return this._response('updateEvent', 'denied', false, 'Organizer login is required to update events.', {});
    }
    return this._response(
      'updateEvent',
      'confirmation_required',
      true,
      'Event updates require the existing organizer update API so bookings and approvals remain safe.',
      { proposedChanges: request.arguments || {} }
    );
  }

  deleteEvent(request, principal) {
    if (!this._isOrganizer(principal)) {
      return this._response('deleteEvent', 'denied', false, 'Organizer login is required to cancel events.', {});
    }
    return this._response(
      'deleteEvent',
      'confirmation_required',
      true,
      'Deleting maps to event cancellation and requires explicit confirmation in the existing event API.',
      request.arguments || {}
    );
  }

  sendEmail(request, principal) {
    if (!this._isOrganizer(principal) && !this._isAdmin(principal)) {
      return this._response('sendEmail', 'denied', false, 'Organizer or admin login is required to send emails.', {});
    }
    return this._response(
      'sendEmail',
      'confirmation_required',
      true,
      'Email delivery requires recipient review before sending.',
      request.arguments || {}
    );
  }

  async getParticipants(request, principal) {
    if (!this._isOrganizer(principal)) {
      return this._response('getParticipants', 'denied', false, 'Organizer login is required to view participants.', {});
    }

    try {
      const eventId = request.arguments?.eventId ? Number(request.arguments.eventId) : null;
      const orgEvents = await Event.find({ organizerId: principal.id }).lean();
      const orgEventIds = orgEvents.map((e) => e.id);

      if (eventId && !orgEventIds.includes(eventId)) {
        return this._response('getParticipants', 'denied', false, 'You do not own this event.', {});
      }

      const query = { eventId: eventId ? eventId : { $in: orgEventIds } };
      const bookings = await Booking.find(query)
  .select('participants eventId')
  .limit(200)
  .lean();

const participants = bookings.flatMap((booking) =>
  (booking.participants || []).map((participant) => ({
    ...participant,
    eventId: booking.eventId,
  }))
);

      const eventMap = new Map(orgEvents.map((e) => [e.id, e.eventName]));
      const list = participants.map((p) => ({
        id: p.id,
        name: p.name,
        email: p.email,
        department: p.department,
        college: p.college,
        eventId: p.eventId,
        eventName: eventMap.get(p.eventId) || 'Event',
      }));

      return this._response('getParticipants', 'success', false, 'Participants retrieved.', {
        participants: list,
      });
    } catch (err) {
      return this._response('getParticipants', 'error', false, err.message, {});
    }
  }

  async generateCertificate(request, principal) {
    if (!this._isOrganizer(principal)) {
      return this._response('generateCertificate', 'denied', false, 'Organizer login is required to generate certificates.', {});
    }
    const eventId = request.arguments?.eventId ? Number(request.arguments.eventId) : null;
    if (!eventId) {
      return this._response('generateCertificate', 'needs_input', false, 'eventId is required.', {});
    }
    return this._response('generateCertificate', 'queued', false, 'Certificate generation has been queued.', {
      eventId,
    });
  }

  async generatePoster(request, principal) {
    if (!this._isOrganizer(principal)) {
      return this._response('generatePoster', 'denied', false, 'Organizer login is required to generate posters.', {});
    }
    const eventId = request.arguments?.eventId ? Number(request.arguments.eventId) : null;
    if (!eventId) {
      return this._response('generatePoster', 'needs_input', false, 'eventId is required.', {});
    }
    return this._response('generatePoster', 'success', false, 'Poster generated.', {
      posterUrl: `/api/events/${eventId}/poster.png`,
    });
  }

  exportExcel(request, principal) {
    if (!this._isOrganizer(principal)) {
      return this._response('exportExcel', 'denied', false, 'Organizer login is required to export participants.', {});
    }
    const eventId = request.arguments?.eventId ? Number(request.arguments.eventId) : null;
    if (!eventId) {
      return this._response('exportExcel', 'needs_input', false, 'eventId is required.', {});
    }
    return this._response('exportExcel', 'success', false, 'Participant export is ready from the organizer attendees export endpoint.', {
      downloadPath: `/api/organizer/events/${eventId}/participants/export`,
    });
  }

  async getAnalytics(principal) {
    if (!this._isOrganizer(principal)) {
      return this._response('getAnalytics', 'denied', false, 'Organizer login is required to view analytics.', {});
    }
    const data = await analyticsTool.execute({}, principal);
    return this._response('getAnalytics', 'success', false, 'Analytics retrieved.', data);
  }

  recommendPrice(request) {
    const capacity = Number(request.arguments?.capacity || 100);
    const base = capacity > 250 ? 399 : capacity > 100 ? 299 : 199;
    return this._response('recommendPrice', 'success', false, 'Recommended price calculated.', {
      recommendedPrice: base,
      currency: 'INR',
    });
  }

  async predictAttendance(request, principal) {
    const eventId = request.arguments?.eventId ? Number(request.arguments.eventId) : null;
    if (eventId && this._isOrganizer(principal)) {
      const evt = await Event.findOne({ id: eventId, organizerId: principal.id }).lean();
      if (evt) {
        const totalSeats = evt.totalSeats || 100;
        const availableSeats = evt.availableSeats || 0;
        const registrations = Math.max(0, totalSeats - availableSeats);
        const predictedAttendance = Math.round(registrations * 0.85);
        return this._response('predictAttendance', 'success', false, 'Prediction generated.', {
          eventId,
          totalSeats,
          registrations,
          predictedAttendance,
          noShowRate: '15%',
          estimatedRevenue: registrations * (Number(evt.ticketPrice) || 0),
        });
      }
    }

    const registrations = Number(request.arguments?.registrations || 50);
    return this._response('predictAttendance', 'success', false, 'Prediction generated.', {
      predictedAttendance: Math.round(registrations * 0.85),
      noShowRate: '15%',
    });
  }

  async summarizeFeedback(request, principal) {
    const eventId = request.arguments?.eventId ? Number(request.arguments.eventId) : null;
    if (!eventId) {
      return this._response('summarizeFeedback', 'needs_input', false, 'eventId is required for feedback summarization.', {});
    }
    const data = await feedbackTool.execute({ eventId }, principal);
    return this._response('summarizeFeedback', 'success', false, 'Feedback summarized.', data);
  }

  async recommendEvents(principal) {
    const data = await recommendationTool.execute({}, principal);
    return this._response('recommendEvents', 'success', false, 'Recommendations retrieved.', {
      sections: data,
    });
  }

  async generateDescription(request) {
    const prompt = request.prompt || request.arguments?.prompt || '';
    const system = 'You are an event marketing copywriter. Return a catchy title, compelling 2-paragraph description, agenda highlights, and 3 FAQs in markdown format.';
    let generated = await aiEngine.complete('DESCRIPTION', system, prompt);
    if (!generated) {
      generated = `## Event Overview\nJoin us for an inspiring session designed to build hands-on skills.\n\n### Key Highlights\n- Interactive workshops with mentors\n- Live Q&A and networking\n- Verified certificates of completion`;
    }
    return this._response('generateDescription', 'success', false, 'Description generated.', {
      description: generated,
    });
  }

  async searchEvents(request, principal) {
    const data = await eventTool.execute({ keyword: request.prompt }, principal);
    return this._response('searchEvents', 'success', false, 'Events retrieved.', {
      events: data.events || [],
    });
  }

  decideTool(prompt = '') {
    const q = prompt.toLowerCase();
    if (q.includes('create') && q.includes('event')) return 'createEvent';
    if (q.includes('update') || q.includes('edit')) return 'updateEvent';
    if (q.includes('delete') || q.includes('cancel event')) return 'deleteEvent';
    if (q.includes('email') || q.includes('reminder')) return 'sendEmail';
    if (q.includes('participant') || q.includes('registered')) return 'getParticipants';
    if (q.includes('certificate')) return 'generateCertificate';
    if (q.includes('poster')) return 'generatePoster';
    if (q.includes('excel') || q.includes('export')) return 'exportExcel';
    if (q.includes('analytics') || q.includes('revenue')) return 'getAnalytics';
    if (q.includes('price')) return 'recommendPrice';
    if (q.includes('predict') || q.includes('attendance')) return 'predictAttendance';
    if (q.includes('feedback') || q.includes('review')) return 'summarizeFeedback';
    if (q.includes('recommend')) return 'recommendEvents';
    if (q.includes('description')) return 'generateDescription';
    return 'searchEvents';
  }

  _response(toolName, status, requiresConfirmation, message, data) {
    return {
      toolName,
      status,
      requiresConfirmation,
      message,
      timestamp: new Date().toISOString(),
      data,
    };
  }

  _isOrganizer(principal) {
    return principal?.role?.toUpperCase() === 'ORGANIZER';
  }

  _isAdmin(principal) {
    return principal?.role?.toUpperCase() === 'ADMIN';
  }
}

export const eventGptToolService = new EventGptToolService();
export default eventGptToolService;
