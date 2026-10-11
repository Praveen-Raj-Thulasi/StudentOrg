import { agentPlanner } from './agentPlanner.js';
import { SystemPrompts } from './systemPrompts.js';
import { ragService } from '../rag/ragService.js';
import { aiEngine } from '../engine/aiEngine.js';
import { analyticsTool } from '../tools/analyticsTool.js';
import { bookingTool } from '../tools/bookingTool.js';
import { certificateTool } from '../tools/certificateTool.js';
import { dashboardTool } from '../tools/dashboardTool.js';
import { emailTool } from '../tools/emailTool.js';
import { eventTool } from '../tools/eventTool.js';
import { feedbackTool } from '../tools/feedbackTool.js';
import { paymentTool } from '../tools/paymentTool.js';
import { recommendationTool } from '../tools/recommendationTool.js';
import { travelTool } from '../tools/travelTool.js';
import logger from '../../utils/logger.js';

export class AgentOrchestrator {
  constructor() {
    this.tools = new Map([
      ['analyticsTool', analyticsTool],
      ['bookingTool', bookingTool],
      ['certificateTool', certificateTool],
      ['dashboardTool', dashboardTool],
      ['emailTool', emailTool],
      ['eventTool', eventTool],
      ['feedbackTool', feedbackTool],
      ['paymentTool', paymentTool],
      ['recommendationTool', recommendationTool],
      ['travelTool', travelTool],
    ]);
  }

  async process(message, history = [], principal = null) {
    if (!message || !message.trim()) {
      return {
        answer: 'Please type a question about events, bookings, or anything I can help with.',
        sources: [],
        provider: 'fallback',
        strategy: 'DIRECT',
      };
    }

    const sanitized = this.sanitize(message);
    const decision = agentPlanner.plan(sanitized, principal);

    logger.debug(
      { strategy: decision.strategy, tools: decision.toolNames, useRag: decision.useRag },
      '[AgentOrchestrator] Processing message'
    );

    switch (decision.strategy) {
      case 'DIRECT':
        return this.handleDirect(sanitized, history, principal);
      case 'RAG_ONLY':
        return this.handleRagOnly(sanitized, history, principal);
      case 'TOOL_CALL':
        return this.handleToolCall(sanitized, decision, history, principal);
      case 'TOOL_AND_RAG':
        return this.handleToolAndRag(sanitized, decision, history, principal);
      default:
        return this.handleDirect(sanitized, history, principal);
    }
  }

  async handleDirect(message, history, principal) {
    const systemPrompt = this.buildEnrichedOrganizerPrompt(principal);
    let answer = await this.callGemini(systemPrompt, message, history);
    if (!answer) {
      answer = this.capabilityFallback(principal);
    }
    return {
      answer,
      sources: [],
      provider: aiEngine.isAvailable() ? 'gemini' : 'fallback',
      strategy: 'DIRECT',
    };
  }

  async handleRagOnly(message, history, principal) {
    const ctx = await ragService.buildContext(message, principal);
    const role = principal?.role;
    const userId = principal?.id;
    const systemPrompt = ragService.conversationalPrompt(ctx, role, userId);

    let answer = await this.callGemini(systemPrompt, message, history);
    if (!answer) {
      answer = this.synthesizeFromRag(ctx, message, principal);
    }

    return {
      answer,
      sources: ctx.documents || [],
      provider: aiEngine.isAvailable() ? 'gemini' : 'fallback',
      strategy: 'RAG_ONLY',
    };
  }

  async handleToolCall(message, decision, history, principal) {
    const toolResults = await this.executeTools(decision.toolNames, message, principal);
    const toolSummary = this.formatToolResults(toolResults);
    const systemPrompt = this.buildSystemWithToolResults(principal, toolSummary);

    let answer = await this.callGemini(systemPrompt, message, history);
    if (!answer) {
      answer = this.synthesizeFallback(toolResults, message, principal);
    }

    return {
      answer,
      sources: [],
      provider: aiEngine.isAvailable() ? 'gemini' : 'fallback',
      strategy: 'TOOL_CALL',
    };
  }

  async handleToolAndRag(message, decision, history, principal) {
    const toolResults = await this.executeTools(decision.toolNames, message, principal);
    const ctx = await ragService.buildContext(message, principal);

    const toolSummary = this.formatToolResults(toolResults);
    const ragContext = ctx.formattedContext;
    const systemPrompt = this.buildSystemWithToolAndRag(principal, toolSummary, ragContext);

    let answer = await this.callGemini(systemPrompt, message, history);
    if (!answer) {
      answer = this.synthesizeFallback(toolResults, message, principal);
    }

    return {
      answer,
      sources: ctx.documents || [],
      provider: aiEngine.isAvailable() ? 'gemini' : 'fallback',
      strategy: 'TOOL_AND_RAG',
    };
  }

  buildEnrichedOrganizerPrompt(principal) {
    return SystemPrompts.forRole(principal?.role, principal?.id);
  }

  buildSystemWithToolResults(principal, toolSummary) {
    const base = SystemPrompts.forRole(principal?.role, principal?.id);
    return (
      base +
      '\n\n## Live Data from Tools\n' +
      toolSummary +
      '\n\nUse the live data above to answer. Generate a natural, human-readable response — never dump raw data. ' +
      'Highlight key numbers. Offer next steps or follow-up options.'
    );
  }

  buildSystemWithToolAndRag(principal, toolSummary, ragContext) {
    const base = SystemPrompts.forRole(principal?.role, principal?.id);
    return (
      base +
      '\n\n## Live Data\n' +
      toolSummary +
      '\n\n## Additional Background Knowledge (use silently — never mention "retrieved context" or "FAQ" to the user)\n' +
      (ragContext || 'None.') +
      '\n\nCombine live data and background knowledge into a natural, conversational, insightful response. ' +
      'Prioritize live data. Never expose raw objects, MongoDB internals, or knowledge source labels.'
    );
  }

  async executeTools(toolNames = [], message, principal) {
    const allResults = {};
    const input = this.extractEntities(message);

    for (const toolName of toolNames) {
      const tool = this.tools.get(toolName);
      if (tool) {
        try {
          const res = await tool.execute(input, principal);
          allResults[toolName] = res;
        } catch (err) {
          logger.warn({ toolName, err: err.message }, '[AgentOrchestrator] Tool execution error');
          allResults[toolName] = { error: 'Tool temporarily unavailable' };
        }
      }
    }

    return allResults;
  }

  extractEntities(message) {
    const entities = {};
    const match = /(?:event|id|#)\s*[:#]?\s*(\d+)/i.exec(message);
    if (match) {
      entities.eventId = match[1];
    }
    entities.keyword = message;
    return entities;
  }

  formatToolResults(toolResults = {}) {
    let sb = '';
    for (const [toolName, result] of Object.entries(toolResults)) {
      sb += `### ${toolName}\n`;
      if (result && typeof result === 'object') {
        const entries = Object.entries(result)
          .filter(([key]) => !this._isVerboseField(key))
          .slice(0, 30);
        for (const [k, v] of entries) {
          const strVal = typeof v === 'object' ? JSON.stringify(v) : String(v);
          sb += `- ${k}: ${this._truncate(strVal, 300)}\n`;
        }
      }
      sb += '\n';
    }
    return sb;
  }

  _isVerboseField(key = '') {
    return (
      key.includes('embedding') ||
      key.includes('messages') ||
      key.includes('password') ||
      key.includes('token')
    );
  }

  _truncate(str, max = 300) {
    return str && str.length > max ? str.substring(0, max) + '…' : str;
  }

  async callGemini(systemPrompt, message, history) {
    if (!aiEngine.isAvailable()) {
      return null;
    }
    return aiEngine.complete('COPILOT', systemPrompt, message, history, false);
  }

  async *processStream(message, history = [], principal = null) {
    if (!message || !message.trim()) {
      yield 'Please type a question about events, bookings, or anything I can help with.';
      return;
    }

    const sanitized = this.sanitize(message);
    const decision = agentPlanner.plan(sanitized, principal);

    let systemPrompt = '';
    if (decision.strategy === 'DIRECT') {
      systemPrompt = this.buildEnrichedOrganizerPrompt(principal);
    } else if (decision.strategy === 'RAG_ONLY') {
      const ctx = await ragService.buildContext(sanitized, principal);
      systemPrompt = ragService.conversationalPrompt(ctx, principal?.role, principal?.id);
    } else if (decision.strategy === 'TOOL_CALL') {
      const toolResults = await this.executeTools(decision.toolNames, sanitized, principal);
      const summary = this.formatToolResults(toolResults);
      systemPrompt = this.buildSystemWithToolResults(principal, summary);
    } else {
      const toolResults = await this.executeTools(decision.toolNames, sanitized, principal);
      const ctx = await ragService.buildContext(sanitized, principal);
      const summary = this.formatToolResults(toolResults);
      systemPrompt = this.buildSystemWithToolAndRag(principal, summary, ctx.formattedContext);
    }

    if (!aiEngine.isAvailable()) {
      yield this.capabilityFallback(principal);
      return;
    }

    try {
      const generator = aiEngine.streamComplete('COPILOT', systemPrompt, sanitized, history);
      for await (const chunk of generator) {
        yield chunk;
      }
    } catch (err) {
      yield this.capabilityFallback(principal);
    }
  }

  synthesizeFromRag(ctx, message, principal) {
    const q = message.toLowerCase();
    if (q.includes('register') || q.includes('booking') || q.includes('ticket')) {
      return (
        'To register for an event:\n\n' +
        '1. Log in and go to **Discover Events**\n' +
        '2. Find the event and click **Register**\n' +
        '3. Select ticket quantity, fill in participant details\n' +
        '4. Upload required documents if prompted\n' +
        '5. Complete payment — your QR ticket is generated automatically\n\n' +
        'Which event are you registering for? I can guide you further.'
      );
    }
    if (q.includes('refund') || q.includes('cancel')) {
      return (
        'To cancel and request a refund:\n\n' +
        '- Go to **My Bookings** and select the booking\n' +
        '- Refunds for paid bookings are initiated automatically on cancellation\n' +
        '- Typically takes 3–7 business days to process\n\n' +
        'Was the payment already deducted?'
      );
    }
    if (q.includes('payment') || q.includes('pay') || q.includes('fail')) {
      return (
        'Payment failures are usually caused by:\n\n' +
        '- Network interruption during checkout\n' +
        '- Bank timeout — the transaction window expired\n' +
        '- Insufficient balance\n\n' +
        "If money was deducted but booking wasn't confirmed, a refund is initiated automatically. " +
        'Was the amount deducted from your account?'
      );
    }
    if (q.includes('certificate')) {
      return (
        'Certificates are issued within 7 days of event completion.\n\n' +
        '- Your attendance must be verified (QR scanned at venue)\n' +
        '- Download from **My Certificates** once ready\n\n' +
        'Which event are you looking for a certificate from?'
      );
    }

    if (ctx && ctx.documents && ctx.documents.length > 0) {
      const first = ctx.documents.find((d) => (d.score || 0) > 0) || ctx.documents[0];
      const snippet = first.content.replace(/\s+/g, ' ').trim();
      return (
        snippet.substring(0, 350) +
        '\n\nIs there anything specific you would like me to clarify?'
      );
    }

    return (
      'Could you give me a bit more detail? I can help with events, registrations, ' +
      'payments, refunds, certificates, and more.'
    );
  }

  synthesizeFallback(toolResults, message, principal) {
    if (!toolResults || Object.keys(toolResults).length === 0) {
      return this.capabilityFallback(principal);
    }

    const parts = [];
    for (const [toolName, data] of Object.entries(toolResults)) {
      if (data && !data.error) {
        parts.push(this.summariseToolData(toolName, data));
      }
    }

    return parts.length > 0 ? parts.join('\n\n') : this.capabilityFallback(principal);
  }

  summariseToolData(toolName, data) {
    switch (toolName) {
      case 'analyticsTool': {
        const events = data.totalEvents || 0;
        const pub = data.publishedEvents || 0;
        const comp = data.completedEvents || 0;
        const regs = data.totalRegistrations || 0;
        let s =
          `Here's a summary of your event analytics:\n\n` +
          `- **Total Events:** ${events}\n` +
          `- **Published (Active):** ${pub}\n` +
          `- **Completed:** ${comp}\n` +
          `- **Total Registrations:** ${regs}\n`;
        if (data.performanceScore) {
          s += `- **Performance Score:** ${data.performanceScore.overallScore}/100 · Badge: ${data.performanceScore.badge}\n`;
        }
        if (Array.isArray(data.topEvents) && data.topEvents.length > 0) {
          s += `\n**Top Events by Registrations:**\n`;
          data.topEvents.forEach((e) => {
            s += `- ${e.eventName} — ${e.registrations} registrations\n`;
          });
        }
        if (data.aiInsights) {
          s += `\n**AI Insights:** ${data.aiInsights}\n`;
        }
        s += `\nWould you like a breakdown of a specific event, or help improving your registrations?`;
        return s;
      }
      case 'eventTool': {
        if (Array.isArray(data.myEvents) && data.myEvents.length > 0) {
          let s = 'Here are your events:\n\n';
          data.myEvents.forEach((e) => {
            s += `- **${e.eventName}** | ${e.status} | ${e.eventDate} | Seats: ${e.availableSeats}/${e.totalSeats}\n`;
          });
          s += '\nWhich event would you like more details about?';
          return s;
        }
        if (Array.isArray(data.events) && data.events.length > 0) {
          let s = 'Here are upcoming events:\n\n';
          data.events.forEach((e) => {
            s += `- **${e.eventName}** | ${e.eventDate} | ${e.venueName || 'Venue TBD'}\n`;
          });
          return s;
        }
        return 'I retrieved your events. Which one would you like to know more about?';
      }
      case 'dashboardTool': {
        if (data.totalEvents !== undefined) {
          return (
            `Here's your dashboard overview:\n\n` +
            `- **Total Events:** ${data.totalEvents}\n` +
            `- **Published:** ${data.publishedEvents}\n` +
            `- **Pending Approval:** ${data.pendingApproval}\n` +
            `- **Total Registrations:** ${data.totalRegistrations}\n\n` +
            `What would you like to do — view analytics, check participants, or manage an event?`
          );
        }
        return `There are currently **${data.upcomingEventsCount} upcoming events** on the platform.`;
      }
      case 'bookingTool': {
        return (
          `You have **${data.count} bookings** (${data.confirmedCount} confirmed). ` +
          `Go to **My Bookings** for full details. Is there a specific booking I can help with?`
        );
      }
      case 'certificateTool': {
        return data.readyToDownload && data.readyToDownload > 0
          ? `You have **${data.readyToDownload} certificate(s)** ready. Visit **My Certificates** to download them.`
          : `No certificates ready yet. They're issued within 7 days of event completion.`;
      }
      default:
        return 'I retrieved the data. What specific information would you like to know?';
    }
  }

  capabilityFallback(principal) {
    if (principal?.role?.toUpperCase() === 'ORGANIZER') {
      return (
        "I can help you with event management. Here's what's available:\n\n" +
        '- 📊 **Analytics** — registrations, revenue, attendance, performance score\n' +
        '- 🎪 **Events** — view, manage, and get stats for your events\n' +
        '- 👥 **Participants** — attendee lists and export\n' +
        '- 📜 **Certificates** — generation and distribution\n' +
        '- 📈 **Predictions** — forecast attendance and revenue\n' +
        '- 🗣️ **Feedback** — sentiment analysis and improvement suggestions\n\n' +
        'What would you like to do?'
      );
    }
    return (
      "I can help you with:\n\n" +
      '- 🎯 **Find events** — search by category, date, college, or keyword\n' +
      '- 🎫 **Bookings** — check your tickets and QR codes\n' +
      '- 💳 **Payments** — transaction history and refund status\n' +
      '- 📜 **Certificates** — earned credentials and downloads\n' +
      '- ✨ **Recommendations** — events personalised for you\n\n' +
      'What are you looking for?'
    );
  }

  sanitize(message) {
    if (!message) return '';
    return String(message)
      .replace(/ignore\s+(all\s+)?(previous|prior|above)\s+instructions?/gi, '[FILTERED]')
      .replace(/you\s+are\s+now/gi, '[FILTERED]')
      .replace(/act\s+as(\s+a)?/gi, '[FILTERED]')
      .replace(/(api[_\s-]?key|password|token)\s*[:=]\s*\S+/gi, '$1=[redacted]')
      .trim();
  }
}

export const agentOrchestrator = new AgentOrchestrator();
export default agentOrchestrator;
