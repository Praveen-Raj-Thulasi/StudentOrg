/**
 * Interface / Base Class for AI Providers
 */
export class AIProvider {
  /**
   * Provider identifier (e.g., 'gemini')
   * @returns {string}
   */
  name() {
    throw new Error('Not implemented');
  }

  /**
   * Check if provider is configured with valid credentials
   * @returns {boolean}
   */
  isConfigured() {
    throw new Error('Not implemented');
  }

  /**
   * Complete text generation
   * @param {string} systemPrompt
   * @param {string} userMessage
   * @param {Array<{role: string, content: string}>} history
   * @param {object} [options]
   * @returns {Promise<string>}
   */
  async complete(systemPrompt, userMessage, history = [], options = {}) {
    throw new Error('Not implemented');
  }

  /**
   * Stream text completion as an async generator of token strings
   * @param {string} systemPrompt
   * @param {string} userMessage
   * @param {Array<{role: string, content: string}>} history
   * @param {object} [options]
   * @returns {AsyncGenerator<string>}
   */
  async *streamComplete(systemPrompt, userMessage, history = [], options = {}) {
    throw new Error('Not implemented');
  }
}

export default AIProvider;
