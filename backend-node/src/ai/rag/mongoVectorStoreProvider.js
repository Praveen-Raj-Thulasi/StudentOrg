import crypto from 'crypto';
import { VectorStoreProvider } from './vectorStore.interface.js';
import { embeddingService } from './embeddingService.js';
import { AiVectorDocument } from '../../models/AiVectorDocument.js';
import logger from '../../utils/logger.js';

/**
 * MongoDB Vector Store Provider.
 * Supports:
 * 1. MongoDB Atlas Vector Search ($vectorSearch) when deployed to Atlas with a vector index.
 * 2. Documented Local Fallback: Evaluates in-memory cosine similarity against stored embeddings,
 *    providing exact vector search semantics without requiring cloud Atlas services in local dev/tests.
 */
export class MongoVectorStoreProvider extends VectorStoreProvider {
  constructor(options = {}) {
    super();
    this.atlasIndexName = options.atlasIndexName || 'vector_index';
    this.enableAtlasVectorSearch = options.enableAtlasVectorSearch ?? true;
    this._atlasAvailable = null; // cached capability check
  }

  providerName() {
    return this._atlasAvailable ? 'mongodb_atlas' : 'mongodb_local_fallback';
  }

  async index(sourceType, sourceId, title, chunks) {
    if (!Array.isArray(chunks) || chunks.length === 0) {
      return 0;
    }

    let indexedCount = 0;
    for (let i = 0; i < chunks.length; i++) {
      const content = chunks[i];
      const contentHash = crypto.createHash('md5').update(content).digest('hex');

      let doc = await AiVectorDocument.findOne({
        sourceType,
        sourceId: String(sourceId),
        chunkIndex: i,
      });

      if (doc && doc.contentHash === contentHash) {
        continue;
      }

      if (!doc) {
        doc = new AiVectorDocument({
          sourceType,
          sourceId: String(sourceId),
          chunkIndex: i,
        });
      }

      const embedding = embeddingService.embed(content);
      const safeTitle = (title || 'Untitled').substring(0, 220);

      doc.title = safeTitle;
      doc.content = content;
      doc.contentHash = contentHash;
      doc.embedding = embedding;
      await doc.save();

      indexedCount += 1;
    }

    return indexedCount;
  }

  async search(query, topK = 10) {
    if (!query || !query.trim()) {
      return [];
    }

    const queryEmbedding = embeddingService.embed(query);

    // Try Atlas Vector Search if enabled and not marked unavailable
    if (this.enableAtlasVectorSearch && this._atlasAvailable !== false) {
      try {
        const atlasResults = await this._searchAtlas(queryEmbedding, topK);
        this._atlasAvailable = true;
        return atlasResults;
      } catch (err) {
        // Not on Atlas or vector index not created; switch to documented local fallback
        this._atlasAvailable = false;
        logger.info(
          { reason: err.message },
          '[VectorStore] MongoDB Atlas Vector Search unavailable; using documented in-memory cosine fallback'
        );
      }
    }

    // Documented local fallback: exact cosine vector similarity
    return this._searchLocalFallback(queryEmbedding, topK);
  }

  async _searchAtlas(queryEmbedding, topK) {
    const pipeline = [
      {
        $vectorSearch: {
          index: this.atlasIndexName,
          path: 'embedding',
          queryVector: queryEmbedding,
          numCandidates: topK * 10,
          limit: topK,
        },
      },
      {
        $project: {
          sourceType: 1,
          sourceId: 1,
          title: 1,
          content: 1,
          score: { $meta: 'vectorSearchScore' },
        },
      },
    ];

    const results = await AiVectorDocument.aggregate(pipeline);
    return results.map((doc) => ({
      sourceType: doc.sourceType,
      sourceId: String(doc.sourceId),
      title: doc.title,
      content: doc.content,
      score: Math.round((doc.score || 0) * 100),
    }));
  }

  async _searchLocalFallback(queryEmbedding, topK) {
    const docs = await AiVectorDocument.find(
      {},
      { sourceType: 1, sourceId: 1, chunkIndex: 1, title: 1, content: 1, embedding: 1 }
    ).lean();

    if (!docs || docs.length === 0) {
      return [];
    }

    const scored = docs
      .map((doc) => {
        const score = embeddingService.cosine(queryEmbedding, doc.embedding || []);
        return {
          sourceType: doc.sourceType,
          sourceId: String(doc.sourceId),
          title: doc.title,
          content: doc.content,
          rawScore: score,
          score: Math.round(score * 100),
        };
      })
      .filter((item) => item.rawScore > 0.05)
      .sort((a, b) => b.rawScore - a.rawScore)
      .slice(0, topK)
      .map(({ rawScore, ...item }) => item);

    return scored;
  }

  async count() {
    return AiVectorDocument.countDocuments();
  }
}

export const mongoVectorStoreProvider = new MongoVectorStoreProvider();
export default mongoVectorStoreProvider;
