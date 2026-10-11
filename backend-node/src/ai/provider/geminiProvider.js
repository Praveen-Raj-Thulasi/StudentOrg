import { GoogleGenAI } from '@google/genai';
import { AIProvider } from './aiProvider.interface.js';
import env from '../../config/env.js';
import logger from '../../utils/logger.js';

/**
 * Gemini Provider using the official @google/genai SDK.
 */
export class GeminiProvider extends AIProvider {
  constructor(options = {}) {
    super();
    this.apiKey = options.apiKey || env.GEMINI_API_KEY;
    this.modelName = options.model || env.GEMINI_MODEL || 'gemini-2.5-flash';
    this.timeoutMs = options.timeoutMs || 25000;

    this.client = null;
    if (this.isConfigured()) {
      try {
        this.client = new GoogleGenAI({ apiKey: this.apiKey });
      } catch (err) {
        logger.warn({ err: err.message }, '[GeminiProvider] Failed to initialize GoogleGenAI client');
      }
    }
  }

  name() {
    return 'gemini';
  }

  isConfigured() {
    return Boolean(
      this.apiKey &&
      this.apiKey !== 'placeholder_gemini_key' &&
      this.apiKey.trim().length > 10
    );
  }

  /**
   * Format history into Gemini contents format
   */
  _formatContents(systemPrompt, userMessage, history = []) {
    const contents = [];

    // History turns
    if (Array.isArray(history)) {
      history.slice(-10).forEach((turn) => {
        const role = turn.role === 'assistant' ? 'model' : 'user';
        if (turn.content && turn.content.trim()) {
          contents.push({
            role,
            parts: [{ text: turn.content.trim() }],
          });
        }
      });
    }

    // Latest user message
    contents.push({
      role: 'user',
      parts: [{ text: userMessage.trim() }],
    });

    return contents;
  }

  async complete(systemPrompt, userMessage, history = [], options = {}) {
    if (!this.isConfigured()) {
      throw new Error('Gemini API is not configured or using placeholder key');
    }

    const contents = this._formatContents(systemPrompt, userMessage, history);
    const config = {};
    if (systemPrompt && systemPrompt.trim()) {
      config.systemInstruction = systemPrompt.trim();
    }
    if (options.temperature !== undefined) {
      config.temperature = options.temperature;
    }

    const timeoutMs = options.timeoutMs || this.timeoutMs;

    const generatePromise = this.client.models.generateContent({
      model: this.modelName,
      contents,
      config,
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Gemini completion timed out after ${timeoutMs}ms`)), timeoutMs)
    );

    try {
      const response = await Promise.race([generatePromise, timeoutPromise]);
      const text = response.text ? response.text.trim() : '';
      return text;
    } catch (err) {
      logger.error({ err: err.message, model: this.modelName }, '[GeminiProvider] Completion error');
      throw err;
    }
  }

  async *streamComplete(systemPrompt, userMessage, history = [], options = {}) {
    if (!this.isConfigured()) {
      throw new Error('Gemini API is not configured or using placeholder key');
    }

    const contents = this._formatContents(systemPrompt, userMessage, history);
    const config = {};
    if (systemPrompt && systemPrompt.trim()) {
      config.systemInstruction = systemPrompt.trim();
    }
    if (options.temperature !== undefined) {
      config.temperature = options.temperature;
    }

    try {
      const stream = await this.client.models.generateContentStream({
        model: this.modelName,
        contents,
        config,
      });

      for await (const chunk of stream) {
        if (chunk.text) {
          yield chunk.text;
        }
      }
    } catch (err) {
      logger.error({ err: err.message, model: this.modelName }, '[GeminiProvider] Streaming error');
      throw err;
    }
  }
}

export const geminiProvider = new GeminiProvider();
export default geminiProvider;
