import logger from '../../utils/logger.js';

/**
 * AI Metrics Service
 * Tracks latency, token consumption, cache performance, and error rates.
 */
class AIMetricsService {
  constructor() {
    this.metrics = {
      calls: 0,
      errors: 0,
      totalLatencyMs: 0,
      estimatedInputTokens: 0,
      estimatedOutputTokens: 0,
      cacheHits: 0,
      cacheMisses: 0,
      modules: {},
    };
  }

  recordCall(moduleName, latencyMs, inputTokens = 0, outputTokens = 0, success = true) {
    this.metrics.calls += 1;
    if (!success) {
      this.metrics.errors += 1;
    }
    this.metrics.totalLatencyMs += latencyMs;
    this.metrics.estimatedInputTokens += inputTokens;
    this.metrics.estimatedOutputTokens += outputTokens;

    if (!this.metrics.modules[moduleName]) {
      this.metrics.modules[moduleName] = {
        calls: 0,
        errors: 0,
        totalLatencyMs: 0,
        inputTokens: 0,
        outputTokens: 0,
      };
    }

    const mod = this.metrics.modules[moduleName];
    mod.calls += 1;
    if (!success) mod.errors += 1;
    mod.totalLatencyMs += latencyMs;
    mod.inputTokens += inputTokens;
    mod.outputTokens += outputTokens;

    logger.debug(
      { moduleName, latencyMs, inputTokens, outputTokens, success },
      `[AIMetrics] Recorded AI call for ${moduleName}`
    );
  }

  recordCacheHit() {
    this.metrics.cacheHits += 1;
  }

  recordCacheMiss() {
    this.metrics.cacheMisses += 1;
  }

  getSnapshot() {
    return {
      ...this.metrics,
      averageLatencyMs:
        this.metrics.calls > 0
          ? Math.round(this.metrics.totalLatencyMs / this.metrics.calls)
          : 0,
      cacheHitRate:
        this.metrics.cacheHits + this.metrics.cacheMisses > 0
          ? Number(
              (
                (this.metrics.cacheHits /
                  (this.metrics.cacheHits + this.metrics.cacheMisses)) *
                100
              ).toFixed(1)
            )
          : 0,
    };
  }

  reset() {
    this.metrics = {
      calls: 0,
      errors: 0,
      totalLatencyMs: 0,
      estimatedInputTokens: 0,
      estimatedOutputTokens: 0,
      cacheHits: 0,
      cacheMisses: 0,
      modules: {},
    };
  }
}

export const aiMetricsService = new AIMetricsService();
export default aiMetricsService;
