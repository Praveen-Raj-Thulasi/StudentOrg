import crypto from 'crypto';

/**
 * Embedding Service.
 * Produces normalized 96-dimensional semantic hash embeddings with caching
 * and exact cosine similarity calculation.
 */
export class EmbeddingService {
  constructor(dimensions = 96) {
    this.dimensions = dimensions;
    this.cache = new Map();
  }

  embed(text) {
    const normalized = text ? String(text).toLowerCase().replace(/\s+/g, ' ').trim() : '';
    const hash = crypto.createHash('md5').update(normalized).digest('hex');

    if (this.cache.has(hash)) {
      return this.cache.get(hash);
    }

    const vector = this._localEmbedding(normalized);
    if (this.cache.size > 2000) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(hash, vector);
    return vector;
  }

  cosine(left = [], right = []) {
    let dot = 0;
    let leftNorm = 0;
    let rightNorm = 0;
    const length = Math.min(left.length, right.length);

    for (let i = 0; i < length; i++) {
      dot += left[i] * right[i];
      leftNorm += left[i] * left[i];
      rightNorm += right[i] * right[i];
    }

    if (leftNorm === 0 || rightNorm === 0) {
      return 0;
    }

    return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
  }

  _localEmbedding(text) {
    const vector = new Array(this.dimensions).fill(0);
    const tokens = text.split(/[^a-z0-9]+/).filter((t) => t.length >= 2);

    for (const token of tokens) {
      let hashVal = 0;
      for (let i = 0; i < token.length; i++) {
        hashVal = (hashVal * 31 + token.charCodeAt(i)) >>> 0;
      }
      const bucket = hashVal % this.dimensions;
      vector[bucket] += 1.0;
    }

    let norm = 0;
    for (const val of vector) {
      norm += val * val;
    }

    if (norm > 0) {
      const scale = 1.0 / Math.sqrt(norm);
      for (let i = 0; i < vector.length; i++) {
        vector[i] = Number((vector[i] * scale).toFixed(6));
      }
    }

    return vector;
  }
}

export const embeddingService = new EmbeddingService();
export default embeddingService;
