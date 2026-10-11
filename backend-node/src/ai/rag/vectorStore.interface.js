/**
 * Contract for all Vector Store Providers
 */
export class VectorStoreProvider {
  /**
   * @returns {string} Name of vector provider (e.g. 'mongodb_atlas' or 'mongodb_local_fallback')
   */
  providerName() {
    throw new Error('Not implemented');
  }

  /**
   * Indexes text chunks with embeddings
   * @param {string} sourceType
   * @param {string} sourceId
   * @param {string} title
   * @param {string[]} chunks
   * @returns {Promise<number>} Number of indexed chunks
   */
  async index(sourceType, sourceId, title, chunks) {
    throw new Error('Not implemented');
  }

  /**
   * Semantic vector search
   * @param {string} query
   * @param {number} topK
   * @returns {Promise<Array<{sourceType: string, sourceId: string, title: string, content: string, score: number}>>}
   */
  async search(query, topK = 10) {
    throw new Error('Not implemented');
  }

  /**
   * Total number of indexed chunks
   * @returns {Promise<number>}
   */
  async count() {
    throw new Error('Not implemented');
  }
}

export default VectorStoreProvider;
