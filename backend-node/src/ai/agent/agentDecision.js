/**
 * Agent Decision representations
 * Strategies: DIRECT | RAG_ONLY | TOOL_CALL | TOOL_AND_RAG
 */
export class AgentDecision {
  constructor(strategy, toolNames = [], useRag = false) {
    this.strategy = strategy;
    this.toolNames = toolNames;
    this.useRag = useRag;
  }

  static direct() {
    return new AgentDecision('DIRECT', [], false);
  }

  static ragOnly() {
    return new AgentDecision('RAG_ONLY', [], true);
  }

  static toolCall(toolNames) {
    return new AgentDecision('TOOL_CALL', toolNames, false);
  }

  static toolAndRag(toolNames) {
    return new AgentDecision('TOOL_AND_RAG', toolNames, true);
  }
}

export default AgentDecision;
