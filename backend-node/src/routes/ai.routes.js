import { Router } from 'express';
import { copilotController } from '../controllers/copilot.controller.js';
import { agentController } from '../controllers/agent.controller.js';
import { ragController } from '../controllers/rag.controller.js';
import { eventGptController } from '../controllers/eventGpt.controller.js';
import { aiController } from '../controllers/ai.controller.js';
import { aiInsightsController } from '../controllers/aiInsights.controller.js';
import { authenticateToken, optionalAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';

const router = Router();

// ── 1. Copilot & Conversational Agents ─────────────────────────────
router.post('/ai/copilot/chat', optionalAuth, (req, res, next) =>
  copilotController.chat(req, res, next)
);
router.get('/ai/copilot/stream', optionalAuth, (req, res, next) =>
  copilotController.stream(req, res, next)
);
router.get('/ai/copilot/sessions', authenticateToken, (req, res, next) =>
  copilotController.sessions(req, res, next)
);
router.get('/ai/copilot/persona', optionalAuth, (req, res, next) =>
  copilotController.persona(req, res, next)
);

// Backward-compatibility aliases for /ai/chat
router.post('/ai/chat', optionalAuth, (req, res, next) =>
  copilotController.chat(req, res, next)
);
router.get('/ai/chat/stream', optionalAuth, (req, res, next) =>
  copilotController.stream(req, res, next)
);
router.get('/ai/chat/sessions', authenticateToken, (req, res, next) =>
  copilotController.sessions(req, res, next)
);

// ── 2. Direct Agent Tools ──────────────────────────────────────────
router.get('/ai/agent/tools', (req, res, next) =>
  agentController.tools(req, res, next)
);
router.post('/ai/agent/invoke', optionalAuth, (req, res, next) =>
  agentController.invoke(req, res, next)
);

// ── 3. RAG Knowledge Ingestion & Status ────────────────────────────
router.post(
  '/ai/rag/index',
  authenticateToken,
  requireRole('ADMIN', 'ORGANIZER'),
  (req, res, next) => ragController.index(req, res, next)
);
router.get(
  '/ai/rag/status',
  authenticateToken,
  requireRole('ADMIN', 'ORGANIZER'),
  (req, res, next) => ragController.status(req, res, next)
);

// ── 4. EventGPT Phase Endpoints ────────────────────────────────────
router.get('/ai/eventgpt/status', (req, res, next) =>
  eventGptController.status(req, res, next)
);
router.get('/ai/eventgpt/events/:eventId/travel-plan', (req, res, next) =>
  eventGptController.travelPlan(req, res, next)
);
router.get(
  '/ai/eventgpt/events/:eventId/travel',
  authenticateToken,
  (req, res, next) => eventGptController.travelDetails(req, res, next)
);
router.post('/ai/eventgpt/events/:eventId/qa', (req, res, next) =>
  eventGptController.eventQa(req, res, next)
);
router.get('/ai/eventgpt/events/:eventId/packing-checklist', (req, res, next) =>
  eventGptController.packingChecklist(req, res, next)
);
router.post(
  '/ai/eventgpt/events/:eventId/feedback-analysis',
  authenticateToken,
  requireRole('ADMIN', 'ORGANIZER'),
  (req, res, next) => eventGptController.feedbackAnalysis(req, res, next)
);
router.post(
  '/ai/eventgpt/events/:eventId/prediction',
  authenticateToken,
  requireRole('ORGANIZER'),
  (req, res, next) => eventGptController.prediction(req, res, next)
);

// ── 5. AI Utilities: NLP Search, Summary, Description, Career ─────
router.get('/ai/search', optionalAuth, (req, res, next) =>
  aiController.nlpSearch(req, res, next)
);
router.get('/ai/events/:eventId/summary', (req, res, next) =>
  aiController.eventSummary(req, res, next)
);
router.post('/ai/events/generate-description', (req, res, next) =>
  aiController.generateDescription(req, res, next)
);
router.get('/ai/career-guidance', optionalAuth, (req, res, next) =>
  aiController.careerGuidance(req, res, next)
);
router.get('/ai/events/:eventId/travel', (req, res, next) =>
  aiController.travelAssistant(req, res, next)
);

// ── 6. Platform AI Insights & Fraud Detection ──────────────────────
router.get(
  '/ai/insights/platform',
  authenticateToken,
  requireRole('ADMIN'),
  (req, res, next) => aiInsightsController.platform(req, res, next)
);
router.get(
  '/ai/insights/fraud',
  authenticateToken,
  requireRole('ADMIN'),
  (req, res, next) => aiInsightsController.fraud(req, res, next)
);
router.get(
  '/ai/insights/behavior/me',
  authenticateToken,
  requireRole('USER', 'STUDENT'),
  (req, res, next) => aiInsightsController.myBehavior(req, res, next)
);
router.post(
  '/ai/insights/behavior/refresh/:userId',
  authenticateToken,
  requireRole('ADMIN'),
  (req, res, next) => aiInsightsController.refreshBehavior(req, res, next)
);

export default router;
