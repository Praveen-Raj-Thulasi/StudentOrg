/**
 * Contract for AI Agent Tools.
 */
export class AgentTool {
  /**
   * Unique name used by the planner
   * @returns {string}
   */
  name() {
    throw new Error('Not implemented');
  }

  /**
   * One-line description of the tool
   * @returns {string}
   */
  description() {
    throw new Error('Not implemented');
  }

  /**
   * Execute the tool with input arguments and authenticated principal context.
   * Never throws uncaught exceptions; returns error details in the result object on failure.
   * @param {object} input
   * @param {object|null} principal
   * @returns {Promise<object>}
   */
  async execute(input = {}, principal = null) {
    throw new Error('Not implemented');
  }
}

export default AgentTool;
