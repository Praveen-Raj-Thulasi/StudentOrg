/**
 * Document chunker for RAG ingestion.
 * Splits long text into chunks up to MAX_CHARS with OVERLAP_CHARS overlap
 * and natural sentence boundary detection.
 */
export class DocumentChunker {
  constructor(maxChars = 900, overlapChars = 120) {
    this.maxChars = maxChars;
    this.overlapChars = overlapChars;
  }

  chunk(content) {
    if (!content || !content.trim()) {
      return [];
    }

    const normalized = content.replace(/\s+/g, ' ').trim();
    if (normalized.length <= this.maxChars) {
      return [normalized];
    }

    const chunks = [];
    let start = 0;

    while (start < normalized.length) {
      let end = Math.min(normalized.length, start + this.maxChars);
      const sentenceEnd = normalized.lastIndexOf('. ', end);

      if (sentenceEnd > start + 250) {
        end = sentenceEnd + 1;
      }

      chunks.push(normalized.substring(start, end).trim());

      if (end >= normalized.length) {
        break;
      }

      start = Math.max(0, end - this.overlapChars);
    }

    return chunks;
  }
}

export const documentChunker = new DocumentChunker();
export default documentChunker;
