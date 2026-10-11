import { retrieverService } from './retrieverService.js';
import { eventKnowledgeRetrievalService } from './eventKnowledgeRetrievalService.js';
import { SystemPrompts } from '../agent/systemPrompts.js';

/**
 * RAG Service.
 * Orchestrates retrieval and builds conversational system prompts with hidden background knowledge.
 */
export class RAGService {
  constructor(
    retriever = retrieverService,
    formatter = eventKnowledgeRetrievalService
  ) {
    this.retriever = retriever;
    this.formatter = formatter;
  }

  async buildContext(query, principal = null) {
    const documents = await this.retriever.retrieve(query, principal);
    const formattedContext = this.formatter.formatContext(documents);
    const sufficient = documents.some((d) => (d.score || 0) > 0);

    return {
      documents,
      formattedContext,
      sufficient,
    };
  }

  conversationalPrompt(context, role, userId) {
    const base = SystemPrompts.forRole(role, userId);

    if (!context || !context.formattedContext || !context.formattedContext.trim()) {
      return (
        base +
        `\n\n## Background Knowledge\nNo specific platform data found for this query.\n` +
        `Use your general knowledge about college event management to answer helpfully.\n` +
        `If you genuinely don't know, say so honestly and offer an alternative suggestion.\n`
      );
    }

    return (
      base +
      `\n\n## Background Knowledge (use this silently — never mention "retrieved context", "FAQ", or "document" to the user)\n` +
      context.formattedContext +
      `\n\n## Critical Rules\n` +
      `- Synthesize the background knowledge into a natural, conversational response\n` +
      `- NEVER say "Based on the retrieved context..." or "FAQ says..." or "Document 1..."\n` +
      `- NEVER list raw knowledge entries — rewrite everything as natural language\n` +
      `- If the background knowledge answers the question, answer confidently\n` +
      `- If it's partial, combine it with your general knowledge\n` +
      `- If it's irrelevant, use your general knowledge and don't mention the knowledge base\n`
    );
  }
}

export const ragService = new RAGService();
export default ragService;
