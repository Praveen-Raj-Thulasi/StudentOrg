import { agentOrchestrator } from '../ai/agent/agentOrchestrator.js';
import { conversationMemoryService } from './conversationMemoryService.js';
import logger from '../utils/logger.js';

/**
 * Conversational Agent Service.
 * Coordinates session memory, rate limiting, and the agent orchestrator.
 */
export class ConversationalAgentService {
  constructor() {
    this.rateLimitMap = new Map();
  }

  async chat(request = {}, principal = null, remoteAddr = '') {
    const message = this._sanitize(request.message);

    if (!message) {
      return this._buildResponse(
        "Please type a question — I'm here to help!",
        request.sessionId || null,
        'fallback',
        []
      );
    }

    if (message.length > 1200) {
      return this._buildResponse(
        'Please keep your message under 1200 characters.',
        request.sessionId || null,
        'fallback',
        []
      );
    }

    const rateKey = this._rateKey(principal, remoteAddr);
    if (!this._checkRateLimit(rateKey)) {
      return this._buildResponse(
        "You're sending messages quickly. Please wait a moment and try again.",
        request.sessionId || null,
        'fallback',
        []
      );
    }

    // Resolve or create session
    const session = await conversationMemoryService.resolveSession(
      request.sessionId,
      principal,
      message
    );

    // Retrieve last N turns
    const history = conversationMemoryService.history(session);

    let agentResponse;
    try {
      agentResponse = await agentOrchestrator.process(message, history, principal);
    } catch (err) {
      logger.error({ err: err.message }, '[ConversationalAgentService] Orchestrator error');
      agentResponse = {
        answer:
          'Something went wrong on my end. Could you try rephrasing your question? ' +
          "I'm here to help with events, bookings, payments, and more.",
        provider: 'fallback',
        sources: [],
      };
    }

    // Persist turn
    await conversationMemoryService.append(session, message, agentResponse.answer);

    return this._buildResponse(
      agentResponse.answer,
      session.sessionId,
      agentResponse.provider,
      agentResponse.sources || []
    );
  }

  async *chatStream(request = {}, principal = null, remoteAddr = '') {
    const message = this._sanitize(request.message);

    if (!message) {
      yield 'Please type a question — I\'m here to help!';
      return;
    }

    if (message.length > 1200) {
      yield 'Please keep your message under 1200 characters.';
      return;
    }

    const rateKey = this._rateKey(principal, remoteAddr);
    if (!this._checkRateLimit(rateKey)) {
      yield 'You\'re sending messages quickly. Please wait a moment and try again.';
      return;
    }

    const session = await conversationMemoryService.resolveSession(
      request.sessionId,
      principal,
      message
    );

    const history = conversationMemoryService.history(session);
    let fullAnswer = '';

    try {
      const generator = agentOrchestrator.processStream(message, history, principal);
      for await (const chunk of generator) {
        if (chunk) {
          fullAnswer += chunk;
          yield chunk;
        }
      }
    } catch (err) {
      logger.error({ err: err.message }, '[ConversationalAgentService] Stream error');
      const errFallback = 'Something went wrong. Please try rephrasing your question.';
      fullAnswer += errFallback;
      yield errFallback;
    }

    await conversationMemoryService.append(session, message, fullAnswer);
  }

  _buildResponse(answer, sessionId, provider = 'gemini', sources = []) {
    return {
      sessionId,
      answer,
      provider,
      timestamp: new Date().toISOString(),
      actions: [
        { label: 'Browse Events', path: '/events' },
        { label: 'My Bookings', path: '/bookings' },
      ],
      sources: sources.slice(0, 6).map((doc) => ({
        type: doc.sourceType,
        id: doc.sourceId,
        title: doc.title,
      })),
    };
  }

  _rateKey(principal, remoteAddr) {
    return principal?.id ? `user:${principal.id}` : `ip:${remoteAddr || 'unknown'}`;
  }

  _checkRateLimit(key) {
    const now = Date.now();
    const timestamps = this.rateLimitMap.get(key) || [];
    const windowStart = now - 60000; // 1 minute window

    const recent = timestamps.filter((t) => t > windowStart);
    if (recent.length >= 20) {
      return false;
    }

    recent.push(now);
    this.rateLimitMap.set(key, recent);
    return true;
  }

  _sanitize(text) {
    if (!text) return '';
    return String(text).trim();
  }
}

export const conversationalAgentService = new ConversationalAgentService();
export default conversationalAgentService;
