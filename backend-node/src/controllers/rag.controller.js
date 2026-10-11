import { documentIndexer } from '../ai/rag/documentIndexer.js';
import { mongoVectorStoreProvider } from '../ai/rag/mongoVectorStoreProvider.js';
import { ApiResponse } from '../utils/apiResponse.js';

export class RagController {
  async index(req, res, next) {
    try {
      const indexedChunks = await documentIndexer.indexCoreKnowledge();
      return ApiResponse.success(res, {
        indexedChunks,
        status: 'completed',
      });
    } catch (err) {
      next(err);
    }
  }

  async status(req, res, next) {
    try {
      const count = await mongoVectorStoreProvider.count();
      const provider = mongoVectorStoreProvider.providerName();
      return ApiResponse.success(res, {
        provider,
        configuredProvider: 'mongodb',
        mode:
          provider === 'mongodb_atlas'
            ? 'MONGODB_ATLAS_VECTOR_SEARCH'
            : 'MONGODB_LOCAL_COSINE_FALLBACK',
        indexedDocuments: count,
        embeddingCache: 'enabled',
        batchIndexing: 'enabled',
      });
    } catch (err) {
      next(err);
    }
  }
}

export const ragController = new RagController();
export default ragController;
