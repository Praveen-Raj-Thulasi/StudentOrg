import crypto from 'crypto';
import { ChatSession } from '../models/ChatSession.js';
import env from '../config/env.js';
import logger from '../utils/logger.js';

/**
 * Conversation Memory Service.
 * Persists session state and last 20 turns in MongoDB.
 */
export class ConversationMemoryService {
  constructor(maxHistory = env.EVENTGPT_MAX_HISTORY_MESSAGES || 20) {
    this.maxHistory = maxHistory;
  }

  async resolveSession(sessionId = null, principal = null, firstMessage = '') {
    const role = principal?.role || 'GUEST';
    const userId = principal?.id || null;

    if (sessionId) {
      let session = await ChatSession.findOne({ sessionId });
      if (session) {
        // Upgrade guest session to authenticated if logged in
        if (!session.userId && userId) {
          session.userId = userId;
          session.userRole = role;
          await session.save();
        }
        return session;
      }
    }

    // Create new session
    const resolvedSessionId = sessionId || crypto.randomUUID();
    const title = firstMessage
      ? firstMessage.substring(0, 40) + (firstMessage.length > 40 ? '…' : '')
      : 'New Chat';

    const newSession = await ChatSession.create({
      sessionId: resolvedSessionId,
      userId,
      userRole: role,
      title,
      messages: [],
    });

    return newSession;
  }

  history(session) {
    if (!session || !Array.isArray(session.messages)) return [];
    return session.messages.slice(-this.maxHistory).map((m) => ({
      role: m.role,
      content: m.content,
    }));
  }

  async append(session, userMessage, assistantResponse) {
    if (!session) return;

    try {
      if (userMessage && userMessage.trim()) {
        session.messages.push({
          role: 'user',
          content: userMessage.trim(),
          timestamp: new Date(),
        });
      }

      if (assistantResponse && assistantResponse.trim()) {
        session.messages.push({
          role: 'assistant',
          content: assistantResponse.trim(),
          timestamp: new Date(),
        });
      }

      // Keep only last maxHistory messages
      if (session.messages.length > this.maxHistory * 2) {
        session.messages = session.messages.slice(-this.maxHistory * 2);
      }

      await session.save();
    } catch (err) {
      logger.warn({ err: err.message }, '[ConversationMemoryService] Error appending message');
    }
  }

  async recentSessions(principal = null) {
    if (!principal || !principal.id) return [];
    return ChatSession.find({ userId: principal.id })
      .sort({ updatedAt: -1 })
      .limit(20)
      .lean();
  }
}

export const conversationMemoryService = new ConversationMemoryService();
export default conversationMemoryService;
