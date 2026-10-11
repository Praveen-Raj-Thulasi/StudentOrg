import { Event } from '../../models/Event.js';
import { Faq } from '../../models/Faq.js';
import { EventRating } from '../../models/EventRating.js';
import { Certificate } from '../../models/Certificate.js';
import { SentimentAnalysis } from '../../models/SentimentAnalysis.js';
import { documentChunker } from './documentChunker.js';
import { mongoVectorStoreProvider } from './mongoVectorStoreProvider.js';
import logger from '../../utils/logger.js';

/**
 * Ingests and indexes core knowledge into the Vector Store.
 */
export class DocumentIndexer {
  constructor(vectorStore = mongoVectorStoreProvider, chunker = documentChunker) {
    this.vectorStore = vectorStore;
    this.chunker = chunker;
  }

  async indexCoreKnowledge() {
    let indexed = 0;
    try {
      indexed += await this.indexPolicies();
      indexed += await this.indexFaqs();
      indexed += await this.indexEvents();
      indexed += await this.indexReviews();
      indexed += await this.indexFeedbackSummaries();
      indexed += await this.indexCertificateTemplates();
      logger.info({ totalIndexed: indexed }, '[DocumentIndexer] Completed indexCoreKnowledge');
    } catch (err) {
      logger.error({ err: err.message }, '[DocumentIndexer] Error indexing core knowledge');
      throw err;
    }
    return indexed;
  }

  async indexEvent(event) {
    if (!event) return 0;
    const content = `
Event: ${event.eventName}. Category: ${event.category || 'N/A'}. Type: ${event.eventType || 'N/A'}.
College: ${event.collegeName || 'N/A'}. Department: ${event.departmentName || 'N/A'}.
Venue: ${event.venueName || 'N/A'}. Location: ${event.location || 'N/A'}. Date: ${event.eventDate}.
Price: ${event.ticketPrice}. Seats available: ${event.availableSeats}.
Description: ${event.description || 'N/A'}. Organizer details: ${event.organizerDetails || 'N/A'}.
Travel guide: ${event.travelGuide || 'N/A'}.
Food: ${event.foodProvided ? event.foodMeals || 'Provided' : 'Not provided'}.
Accommodation: ${event.accommodationProvided ? (typeof event.accommodationDetails === 'object' ? JSON.stringify(event.accommodationDetails) : event.accommodationDetails || 'Provided') : 'Not provided'}.
Authorized document: ${event.authorizedDocumentUrl || 'N/A'}.
`.trim();

    const chunks = this.chunker.chunk(content);
    return this.vectorStore.index('EVENT', String(event.id || event._id), event.eventName, chunks);
  }

  async indexEvents() {
    const today = new Date().toISOString().split('T')[0];
    const events = await Event.find({
      status: 'PUBLISHED',
      eventDate: { $gte: today },
    }).lean();

    let count = 0;
    for (const evt of events) {
      count += await this.indexEvent(evt);
    }
    return count;
  }

  async indexFaqs() {
    const faqs = await Faq.find({ active: true }).lean();
    let count = 0;
    for (const faq of faqs) {
      const content = `${faq.category}. ${faq.question} ${faq.answer}`;
      const chunks = this.chunker.chunk(content);
      count += await this.vectorStore.index('FAQ', String(faq.id || faq._id), faq.question, chunks);
    }
    return count;
  }

  async indexReviews() {
    const reviews = await EventRating.find({ moderationStatus: 'APPROVED' })
      .populate('event', 'eventName')
      .lean();

    let count = 0;
    for (const review of reviews) {
      if (!review.reviewText || !review.reviewText.trim()) continue;
      const eventName = review.event?.eventName || 'Event';
      const content = `Event: ${eventName}. Rating: ${review.overallRating}. Sentiment: ${review.sentiment || 'N/A'}. Review: ${review.reviewText}`;
      const chunks = this.chunker.chunk(content);
      count += await this.vectorStore.index(
        'REVIEW',
        String(review.id || review._id),
        `Review for ${eventName}`,
        chunks
      );
    }
    return count;
  }

  async indexFeedbackSummaries() {
    const summaries = await SentimentAnalysis.find({})
      .populate('event', 'eventName')
      .lean();

    let count = 0;
    for (const summary of summaries) {
      const eventName = summary.event?.eventName || 'Event';
      const content = `Event: ${eventName}. Positive: ${summary.positiveCount || 0}. Neutral: ${summary.neutralCount || 0}. Negative: ${summary.negativeCount || 0}. Strengths: ${summary.strengths || 'N/A'}. Weaknesses: ${summary.weaknesses || 'N/A'}. Improvements: ${summary.improvementSuggestions || 'N/A'}. Report: ${summary.improvementReport || 'N/A'}`;
      const chunks = this.chunker.chunk(content);
      count += await this.vectorStore.index(
        'FEEDBACK_SUMMARY',
        String(summary.id || summary._id),
        `Feedback summary for ${eventName}`,
        chunks
      );
    }
    return count;
  }

  async indexCertificateTemplates() {
    const templatePolicy =
      'Certificate templates populate participant name, college, department, certificate ID, QR code, date, event name, and signature. ' +
      'Certificates are issued after event completion for eligible attendees with verified attendance and can be delivered by email.';
    let count = await this.vectorStore.index(
      'CERTIFICATE_TEMPLATE',
      'default',
      'Default certificate template policy',
      this.chunker.chunk(templatePolicy)
    );

    const certs = await Certificate.find({}).limit(100).lean();
    for (const cert of certs) {
      const content = `Certificate: ${cert.certificateId}. Event: ${cert.eventName}. Status: ${cert.status}. Issued at: ${cert.issuedAt}.`;
      count += await this.vectorStore.index(
        'CERTIFICATE',
        cert.certificateId,
        cert.eventName,
        this.chunker.chunk(content)
      );
    }
    return count;
  }

  async indexPolicies() {
    const policies =
      'Bookings create QR tickets. Refunds apply to successful paid bookings when cancelled. ' +
      'Certificates are issued for eligible completed events. Guests can view public event knowledge only. ' +
      'Students can access their own bookings, certificates, payments, ratings, recommendations, and portfolio data. ' +
      'Organizers can access their own events, participants, analytics, travel data, certificates, and feedback.';
    return this.vectorStore.index(
      'POLICY',
      'core',
      'Core EventGPT policies',
      this.chunker.chunk(policies)
    );
  }
}

export const documentIndexer = new DocumentIndexer();
export default documentIndexer;
