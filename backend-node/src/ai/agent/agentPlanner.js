import { AgentDecision } from './agentDecision.js';

/**
 * AI Planner — decides how to handle each user message:
 * 1. DIRECT       — general knowledge, greetings, platform how-to questions
 * 2. RAG_ONLY     — questions about specific events, FAQs, policies in the vector store
 * 3. TOOL_CALL    — live data needed (bookings, payments, analytics, recommendations…)
 * 4. TOOL_AND_RAG — tool output + RAG context combined for richer responses
 */
export class AgentPlanner {
  plan(message, principal = null) {
    if (!message || !message.trim()) return AgentDecision.direct();

    const q = message.toLowerCase().trim();
    const role = principal?.role?.toUpperCase();
    const isOrganizer = role === 'ORGANIZER';
    const isStudent = role === 'USER' || role === 'STUDENT';

    // 1. Greeting / capability question -> DIRECT
    if (this._isGreeting(q) || this._isCapabilityQuestion(q)) {
      return AgentDecision.direct();
    }

    // 2. General platform how-to / policy questions -> RAG_ONLY
    if (!isOrganizer && this._isPolicyOrFaqQuestion(q)) {
      return AgentDecision.ragOnly();
    }

    // 3. Detect applicable tools
    const tools = [];
    if (this._isDashboardQuestion(q)) {
      tools.push('dashboardTool');
    }
    if (isOrganizer && this._isAnalyticsQuestion(q)) {
      tools.push('analyticsTool');
    }
    if (this._isEventQuestion(q)) {
      tools.push('eventTool');
    }
    if (isStudent && this._isBookingQuestion(q)) {
      tools.push('bookingTool');
    }
    if (isStudent && this._isPaymentQuestion(q)) {
      tools.push('paymentTool');
    }
    if (this._isCertificateQuestion(q)) {
      tools.push('certificateTool');
    }
    if (this._isRecommendationQuestion(q)) {
      tools.push('recommendationTool');
    }
    if (this._isTravelQuestion(q)) {
      tools.push('travelTool');
    }
    if (this._isFeedbackQuestion(q)) {
      tools.push('feedbackTool');
    }
    if (this._isEmailQuestion(q)) {
      tools.push('emailTool');
    }

    // 4. Decide strategy
    if (tools.length === 0) {
      return AgentDecision.ragOnly();
    }

    // Organizers always benefit from RAG enrichment for richer responses
    if (isOrganizer) {
      return AgentDecision.toolAndRag(tools);
    }

    // Students: event/recommendation queries benefit from RAG
    const ragBeneficial =
      tools.includes('eventTool') ||
      tools.includes('recommendationTool') ||
      tools.includes('certificateTool');

    if (ragBeneficial) {
      return AgentDecision.toolAndRag(tools);
    }

    return AgentDecision.toolCall(tools);
  }

  _isGreeting(q) {
    return /^(hi|hello|hey|greetings|good morning|good afternoon|good evening|what can you do|who are you|what are you)\b/i.test(
      q
    );
  }

  _isCapabilityQuestion(q) {
    return (
      q.includes('what can you') ||
      q.includes('how can you help') ||
      q.includes('what do you do') ||
      q.includes('your features') ||
      q.includes('capabilities')
    );
  }

  _isPolicyOrFaqQuestion(q) {
    return (
      q.includes('how to') ||
      q.includes('how do i') ||
      q.includes('what is') ||
      q.includes('policy') ||
      q.includes('rules') ||
      q.includes('faq') ||
      q.includes('explain') ||
      q.includes('what happens') ||
      q.includes('can i cancel') ||
      q.includes('refund policy') ||
      q.includes('terms')
    );
  }

  _isDashboardQuestion(q) {
    return (
      q.includes('dashboard') ||
      q.includes('overview') ||
      q.includes('summary') ||
      q.includes('quick stats')
    );
  }

  _isAnalyticsQuestion(q) {
    return (
      q.includes('analytics') ||
      q.includes('revenue') ||
      q.includes('earnings') ||
      q.includes('registrations') ||
      q.includes('how many students') ||
      q.includes('performance') ||
      q.includes('score') ||
      q.includes('badge') ||
      q.includes('attendance rate') ||
      q.includes('report') ||
      q.includes('stats')
    );
  }

  _isEventQuestion(q) {
    return (
      q.includes('event') ||
      q.includes('workshop') ||
      q.includes('hackathon') ||
      q.includes('seminar') ||
      q.includes('fest') ||
      q.includes('upcoming') ||
      q.includes('schedule') ||
      q.includes('when is') ||
      q.includes('where is') ||
      q.includes('tickets available') ||
      q.includes('seats')
    );
  }

  _isBookingQuestion(q) {
    return (
      q.includes('booking') ||
      q.includes('ticket') ||
      q.includes('my reservation') ||
      q.includes('qr code') ||
      q.includes('booked') ||
      q.includes('registration status')
    );
  }

  _isPaymentQuestion(q) {
    return (
      q.includes('payment') ||
      q.includes('paid') ||
      q.includes('refund') ||
      q.includes('transaction') ||
      q.includes('amount') ||
      q.includes('charged') ||
      q.includes('money back')
    );
  }

  _isCertificateQuestion(q) {
    return (
      q.includes('certificate') ||
      q.includes('certification') ||
      q.includes('credential') ||
      q.includes('participation letter')
    );
  }

  _isRecommendationQuestion(q) {
    return (
      q.includes('recommend') ||
      q.includes('suggest') ||
      q.includes('what should i attend') ||
      q.includes('best event') ||
      q.includes('trending') ||
      q.includes('popular') ||
      q.includes('for me') ||
      q.includes('free event')
    );
  }

  _isTravelQuestion(q) {
    return (
      q.includes('travel') ||
      q.includes('how to reach') ||
      q.includes('how to get to') ||
      q.includes('directions') ||
      q.includes('bus') ||
      q.includes('train') ||
      q.includes('metro') ||
      q.includes('cab') ||
      q.includes('hotel') ||
      q.includes('parking') ||
      q.includes('venue address')
    );
  }

  _isFeedbackQuestion(q) {
    return (
      q.includes('feedback') ||
      q.includes('review') ||
      q.includes('rating') ||
      q.includes('sentiment') ||
      q.includes('satisfaction') ||
      q.includes('what did attendees') ||
      q.includes('opinions')
    );
  }

  _isEmailQuestion(q) {
    return (
      q.includes('email') ||
      q.includes('notification') ||
      q.includes('reminder') ||
      q.includes('mail') ||
      q.includes('notify') ||
      q.includes('send message')
    );
  }
}

export const agentPlanner = new AgentPlanner();
export default agentPlanner;
