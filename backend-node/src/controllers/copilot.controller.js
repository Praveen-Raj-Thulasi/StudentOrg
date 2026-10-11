import crypto from 'crypto';
import { conversationalAgentService } from '../services/conversationalAgentService.js';
import { conversationMemoryService } from '../services/conversationMemoryService.js';
import { ApiResponse } from '../utils/apiResponse.js';
import logger from '../utils/logger.js';

export class CopilotController {
  async chat(req, res, next) {
    try {
      const response = await conversationalAgentService.chat(
        req.body,
        req.user || null,
        req.ip
      );
      return ApiResponse.success(res, response);
    } catch (err) {
      next(err);
    }
  }

  async stream(req, res, next) {
    const message = req.query.message || '';
    const sessionId = req.query.sessionId || crypto.randomUUID();

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    if (res.flushHeaders) res.flushHeaders();

    let isClosed = false;
    req.on('close', () => {
      isClosed = true;
    });

    try {
      res.write(`event: session\ndata: ${sessionId}\n\n`);

      const generator = conversationalAgentService.chatStream(
        { message, sessionId },
        req.user || null,
        req.ip
      );

      for await (const token of generator) {
        if (isClosed) break;
        if (token) {
          res.write(`event: token\ndata: ${token}\n\n`);
        }
      }

      if (!isClosed) {
        res.write(`event: done\ndata: [DONE]\n\n`);
        res.end();
      }
    } catch (err) {
      logger.error({ err: err.message }, '[CopilotController] SSE stream error');
      if (!isClosed) {
        res.write(`event: error\ndata: Something went wrong. Please try again.\n\n`);
        res.end();
      }
    }
  }

  async sessions(req, res, next) {
    try {
      const sessions = await conversationMemoryService.recentSessions(req.user || null);
      const mapped = sessions.map((s) => ({
        sessionId: s.sessionId,
        title: s.title || 'Chat',
        updatedAt: s.updatedAt,
      }));
      return ApiResponse.success(res, mapped);
    } catch (err) {
      next(err);
    }
  }

  async persona(req, res, next) {
    try {
      const role = (req.user?.role || 'GUEST').toUpperCase();
      let personaData;

      switch (role) {
        case 'ORGANIZER':
          personaData = {
            name: 'EventCopilot',
            role: 'ORGANIZER',
            description: 'Your AI-powered event management copilot',
            capabilities: [
              'Analytics & revenue insights',
              'Participant management',
              'Certificate generation',
              'Event predictions',
              'Feedback sentiment analysis',
              'Email & notification management',
            ],
            avatar: '🎯',
          };
          break;
        case 'USER':
        case 'STUDENT':
          personaData = {
            name: 'EventBot',
            role: 'USER',
            description: 'Your personal event discovery assistant',
            capabilities: [
              'Event discovery & recommendations',
              'Booking & ticket management',
              'Payment & refund status',
              'Certificate downloads',
              'Travel directions to venues',
              'Career guidance',
            ],
            avatar: '🎓',
          };
          break;
        default:
          personaData = {
            name: 'EventBot',
            role: 'GUEST',
            description: 'Discover events and get answers',
            capabilities: [
              'Browse upcoming events',
              'Platform FAQ',
              'Event details',
            ],
            avatar: '🎫',
          };
      }

      return ApiResponse.success(res, personaData);
    } catch (err) {
      next(err);
    }
  }
}

export const copilotController = new CopilotController();
export default copilotController;
