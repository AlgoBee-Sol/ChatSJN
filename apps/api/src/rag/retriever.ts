import type { Citation, Marja, Topic } from '@sjn/shared';
import { SourceChunk, SourceDocument } from '../models.js';
import { config } from '../config.js';
import { AppError } from '../errors.js';
import type { EmbeddingProvider } from './providers.js';
import { SourceAuthorityResolver } from './policy.js';
export function cosine(a: number[], b: number[]) {
  if (!a.length || a.length !== b.length) return -1;
  const dot = a.reduce((sum, v, i) => sum + v * b[i], 0);
  const norm = Math.hypot(...a) * Math.hypot(...b);
  return norm ? dot / norm : -1;
}
export class KnowledgeRetriever {
  constructor(private embeddings: EmbeddingProvider) {}
  async retrieve(question: string, category: Topic, marja: Marja): Promise<Citation[]> {
    const documents = await SourceDocument.find(
      new SourceAuthorityResolver().resolve(category, marja),
    ).lean();
    if (!documents.length) return [];
    const chunks = await SourceChunk.find({
      documentId: { $in: documents.map((d) => d._id) },
      embeddingModel: this.embeddings.model,
    })
      .limit(5001)
      .lean();
    if (chunks.length > 5000)
      throw new AppError(
        503,
        'INDEX_CAPACITY',
        'The local search index has reached its supported capacity.',
      );
    const [vector] = await this.embeddings.embed([question]);
    return chunks
      .map((c) => ({ c, score: cosine(c.embedding, vector) }))
      .filter((x) => x.score >= config.RAG_MIN_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(({ c }) => {
        const d = documents.find((d) => d._id.equals(c.documentId))!;
        return {
          chunkId: c._id.toString(),
          documentId: d._id.toString(),
          title: d.title,
          scholar: d.scholar,
          url: d.originalSourceURL || '',
          originalText: c.originalText,
          pageNumber: c.pageNumber ?? undefined,
          section: c.section || '',
          rulingNumber: c.rulingNumber || '',
          version: d.version || '1',
          authority: d.religiousAuthorityId,
        };
      });
  }
}
