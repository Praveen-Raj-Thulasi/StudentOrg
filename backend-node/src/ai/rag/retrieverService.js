import { mongoVectorStoreProvider } from './mongoVectorStoreProvider.js';
import { eventKnowledgeRetrievalService } from './eventKnowledgeRetrievalService.js';
import env from '../../config/env.js';

/**
 * Retriever Service.
 * Combines semantic vector search and scoped live documents.
 */
export class RetrieverService {
  constructor(
    vectorStore = mongoVectorStoreProvider,
    scopedRetrieval = eventKnowledgeRetrievalService,
    maxContextDocuments = env.EVENTGPT_MAX_CONTEXT_DOCUMENTS || 12
  ) {
    this.vectorStore = vectorStore;
    this.scopedRetrieval = scopedRetrieval;
    this.maxContextDocuments = maxContextDocuments;
  }

  async retrieve(query, principal = null) {
    const merged = new Map();

    const [vectorDocs, scopedDocs] = await Promise.all([
      this.vectorStore.search(query, this.maxContextDocuments),
      this.scopedRetrieval.retrieve(query, principal),
    ]);

    const all = [...vectorDocs, ...scopedDocs];
    all.sort((a, b) => (b.score || 0) - (a.score || 0));

    for (const doc of all) {
      const key = `${doc.sourceType}:${doc.sourceId}:${doc.title}`;
      if (!merged.has(key)) {
        merged.set(key, doc);
      }
    }

    return Array.from(merged.values()).slice(0, this.maxContextDocuments);
  }
}

export const retrieverService = new RetrieverService();
export default retrieverService;
