import crypto from 'crypto';
import env from '../../config/env.js';
import logger from '../../utils/logger.js';
import { geminiProvider } from '../provider/geminiProvider.js';
import { aiMetricsService } from './aiMetricsService.js';

/**
 * Centralized AI Engine — single façade for all AI operations in backend-node.
 */
export class AIEngine {
  constructor(providers = [geminiProvider]) {
    this.providers = providers;
    this.preferredProviderName = env.AI_PROVIDER || 'gemini';
    this.promptCache = new Map();
    this.CACHE_MAX = 200;
  }

  /**
   * Resolve an active configured provider
   */
  resolve() {
    const preferred = this.providers.find(
      (p) => p.name().toLowerCase() === this.preferredProviderName.toLowerCase() && p.isConfigured()
    );
    if (preferred) return preferred;

    return this.providers.find((p) => p.isConfigured()) || null;
  }

  isAvailable() {
    return this.resolve() !== null;
  }

  /**
   * Sanitizes input to protect against prompt injection
   */
  sanitize(prompt) {
    if (!prompt) return '';
    return String(prompt)
      .replace(/ignore\s+(all\s+)?(previous|prior|above)\s+instructions?/gi, '[FILTERED]')
      .replace(/you\s+are\s+now/gi, '[FILTERED]')
      .replace(/act\s+as(\s+a)?/gi, '[FILTERED]')
      .replace(/disregard\s+(your\s+)?(rules|instructions|guidelines)/gi, '[FILTERED]')
      .replace(/(api[_\s-]?key|password|token)\s*[:=]\s*\S+/gi, '$1=[redacted]')
      .trim();
  }

  _cacheKey(system, user) {
    return crypto
      .createHash('md5')
      .update(`${system || ''}|${user || ''}`)
      .digest('hex');
  }

  /**
   * Execute an AI completion
   */
  async complete(moduleName, system, user, history = [], cache = false) {
    const safeUser = this.sanitize(user);
    const key = this._cacheKey(system, safeUser);

    if (cache && this.promptCache.has(key)) {
      logger.debug({ moduleName }, `[AIEngine][${moduleName}] Cache hit`);
      aiMetricsService.recordCacheHit();
      return this.promptCache.get(key);
    }

    if (cache) {
      aiMetricsService.recordCacheMiss();
    }

    const provider = this.resolve();
    const inputTokens = Math.ceil(((safeUser?.length || 0) + (system?.length || 0)) / 4);

    if (!provider) {
      logger.warn({ moduleName }, `[AIEngine][${moduleName}] No AI provider configured — returning null`);
      aiMetricsService.recordCall(moduleName, 0, inputTokens, 0, false);
      return null;
    }

    const start = Date.now();
    try {
      const result = await provider.complete(system, safeUser, history);
      const latency = Date.now() - start;
      const outputTokens = result ? Math.ceil(result.length / 4) : 0;

      aiMetricsService.recordCall(moduleName, latency, inputTokens, outputTokens, true);

      if (result && cache) {
        if (this.promptCache.size >= this.CACHE_MAX) {
          const firstKey = this.promptCache.keys().next().value;
          this.promptCache.delete(firstKey);
        }
        this.promptCache.set(key, result);
      }

      return result;
    } catch (err) {
      const latency = Date.now() - start;
      logger.warn({ moduleName, err: err.message }, `[AIEngine][${moduleName}] Completion failed`);
      aiMetricsService.recordCall(moduleName, latency, inputTokens, 0, false);
      return null;
    }
  }

  /**
   * Streaming completion generator
   */
  async *streamComplete(moduleName, system, user, history = []) {
    const safeUser = this.sanitize(user);
    const provider = this.resolve();
    const inputTokens = Math.ceil(((safeUser?.length || 0) + (system?.length || 0)) / 4);

    if (!provider) {
      logger.warn({ moduleName }, `[AIEngine][${moduleName}] No AI provider configured — empty stream`);
      aiMetricsService.recordCall(`${moduleName}_STREAM`, 0, inputTokens, 0, false);
      return;
    }

    const start = Date.now();
    let totalOutputChars = 0;
    try {
      const generator = provider.streamComplete(system, safeUser, history);
      for await (const chunk of generator) {
        if (chunk) {
          totalOutputChars += chunk.length;
          yield chunk;
        }
      }

      const latency = Date.now() - start;
      const outputTokens = Math.ceil(totalOutputChars / 4);
      aiMetricsService.recordCall(`${moduleName}_STREAM`, latency, inputTokens, outputTokens, true);
    } catch (err) {
      const latency = Date.now() - start;
      logger.warn({ moduleName, err: err.message }, `[AIEngine][${moduleName}] Stream completion failed`);
      aiMetricsService.recordCall(`${moduleName}_STREAM`, latency, inputTokens, 0, false);
      throw err;
    }
  }

  async completeCached(moduleName, system, user) {
    return this.complete(moduleName, system, user, [], true);
  }
}

export const aiEngine = new AIEngine();
export default aiEngine;
