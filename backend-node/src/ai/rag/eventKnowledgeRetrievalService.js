import { Event } from '../../models/Event.js';
import { Booking } from '../../models/Booking.js';
import { Payment } from '../../models/Payment.js';
import { Refund } from '../../models/Refund.js';
import { Faq } from '../../models/Faq.js';

/**
 * Scoped Knowledge Retrieval Service.
 * Retrieves scoped live context for user/organizer and formats it for RAG injection.
 */
export class EventKnowledgeRetrievalService {
  constructor(maxDocuments = 12) {
    this.maxDocuments = maxDocuments;
  }

  async retrieve(query = '', principal = null) {
    const terms = this._tokenize(query);
    const documents = [];

    // Core policy fact
    documents.push({
      sourceType: 'POLICY',
      sourceId: 'public-event-lifecycle',
      title: 'Core platform policies',
      content:
        'Discover shows published upcoming public events. Confirmed bookings create QR tickets for venue entry. ' +
        'Successful paid bookings can create refunds when cancelled. Certificates are available after eligible completed events.',
      score: this._score(
        'booking payment refund certificate qr cancellation registration schedule',
        terms
      ),
    });

    // Upcoming public events
    const today = new Date().toISOString().split('T')[0];
    const upcomingEvents = await Event.find({
      status: 'PUBLISHED',
      eventDate: { $gte: today },
    })
      .sort({ eventDate: 1 })
      .limit(30)
      .lean();

    for (const evt of upcomingEvents) {
      const content =
        `Event: ${evt.eventName}. Category: ${evt.category || 'N/A'}. ` +
        `College: ${evt.collegeName || 'N/A'}. Department: ${evt.departmentName || 'N/A'}. ` +
        `Venue: ${evt.venueName || 'N/A'}. Location: ${evt.location || 'N/A'}. Date: ${evt.eventDate}. ` +
        `Seats: ${evt.availableSeats}. Price: ${evt.ticketPrice}. Type: ${evt.eventType || 'N/A'}.`;

      documents.push({
        sourceType: 'EVENT',
        sourceId: String(evt.id || evt._id),
        title: evt.eventName,
        content,
        score: this._score(`${content} ${evt.tags || ''}`, terms),
      });
    }

    // Active FAQs
    const faqs = await Faq.find({ active: true })
      .sort({ category: 1, question: 1 })
      .limit(30)
      .lean();

    for (const faq of faqs) {
      documents.push({
        sourceType: 'FAQ',
        sourceId: String(faq.id || faq._id),
        title: `${faq.category}: ${faq.question}`,
        content: faq.answer,
        score: this._score(`${faq.category} ${faq.question} ${faq.answer}`, terms),
      });
    }

    // Role-scoped context
    const role = principal?.role?.toUpperCase();
    const userId = principal?.id;

    if (userId && (role === 'USER' || role === 'STUDENT')) {
      // User bookings
      const bookings = await Booking.find({ userId })
        .populate('event', 'eventName eventDate')
        .sort({ bookedAt: -1 })
        .limit(10)
        .lean();

      for (const b of bookings) {
        const evtName = b.event?.eventName || 'Event';
        const evtDate = b.event?.eventDate || 'N/A';
        documents.push({
          sourceType: 'USER_BOOKING',
          sourceId: String(b.id || b._id),
          title: `Booking ${b.ticketId}`,
          content: `Event: ${evtName}. Date: ${evtDate}. Booking status: ${b.bookingStatus}. Ticket status: ${b.ticketStatus}. Quantity: ${b.quantity}.`,
          score: this._score(`${evtName} booking ticket qr`, terms) + 4,
        });
      }

      // User payments
      const bookingIds = bookings.map((b) => b.id);
      const bookingObjectIds = bookings.map((b) => b._id);
      const payments = await Payment.find({
        $or: [
          { bookingId: { $in: bookingIds } },
          { booking: { $in: bookingObjectIds } },
        ],
      })
        .sort({ paidAt: -1 })
        .limit(5)
        .lean();

      for (const p of payments) {
        documents.push({
          sourceType: 'USER_PAYMENT',
          sourceId: String(p.id || p._id),
          title: `Payment ${p.transactionId}`,
          content: `Payment status: ${p.paymentStatus}. Amount: ${p.amount}.`,
          score: this._score('payment paid transaction amount', terms) + 3,
        });
      }

      // User refunds
      const refunds = await Refund.find({ userId })
        .sort({ createdAt: -1 })
        .limit(5)
        .lean();

      for (const r of refunds) {
        documents.push({
          sourceType: 'USER_REFUND',
          sourceId: String(r.id || r._id),
          title: `Refund ${r.refundReference}`,
          content: `Refund status: ${r.refundStatus}. Amount: ${r.refundAmount}.`,
          score: this._score('refund cancellation money', terms) + 3,
        });
      }
    }

    if (userId && role === 'ORGANIZER') {
      const orgEvents = await Event.find({ organizerId: userId })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean();

      for (const evt of orgEvents) {
        documents.push({
          sourceType: 'ORGANIZER_EVENT',
          sourceId: String(evt.id || evt._id),
          title: `Organizer event ${evt.eventName}`,
          content: `Status: ${evt.status}. Date: ${evt.eventDate}. Seats: ${evt.availableSeats}/${evt.totalSeats}. Category: ${evt.category}.`,
          score: this._score(`${evt.eventName} organizer attendance registration revenue`, terms) + 4,
        });
      }
    }

    // Sort documents by score descending and limit
    return documents
      .sort((a, b) => b.score - a.score)
      .slice(0, this.maxDocuments);
  }

  formatContext(documents = []) {
    if (!documents || documents.length === 0) return '';
    return documents
      .map(
        (doc) => `- [${doc.sourceType}:${doc.sourceId}] ${doc.title} - ${doc.content}`
      )
      .join('\n');
  }

  _score(content, terms) {
    if (!terms || terms.size === 0 || !content) return 1;
    const lower = content.toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (lower.includes(term)) score += 1;
    }
    return score;
  }

  _tokenize(query) {
    const terms = new Set();
    if (!query) return terms;
    query
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2)
      .forEach((t) => terms.add(t));
    return terms;
  }
}

export const eventKnowledgeRetrievalService = new EventKnowledgeRetrievalService();
export default eventKnowledgeRetrievalService;
