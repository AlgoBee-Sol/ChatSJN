import { afterEach, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import type { User } from '@sjn/shared';
// The historical bug must not return when the product scope flag changes.
vi.mock('@sjn/shared/features', () => ({ FIQH_ENABLED: true }));
import { ChatService } from '../src/rag/chat-service.js';
import { KnowledgeRetriever } from '../src/rag/retriever.js';
import { SourceDocument } from '../src/models.js';

afterEach(() => vi.restoreAllMocks());
it('searches an unclassified clear question even with Fiqh enabled', async () => {
  const retrieve = vi.spyOn(KnowledgeRetriever.prototype, 'retrieve').mockResolvedValue([]);
  vi.spyOn(mongoose.Query.prototype, 'lean').mockResolvedValue([]);
  vi.spyOn(SourceDocument, 'countDocuments').mockResolvedValue(0);
  const generate = vi.fn();
  const question =
    'ایران کے اندر عظیم انقلاب کے رونما ہونے کے سلسلے میں کیا راجح اور چند غیر راجح نظریات پائے جاتے ہیں؟';
  const result = await new ChatService({
    configured: true,
    embeddings: { model: 'test', embed: vi.fn() },
    llm: { generate },
  }).answer({ language: 'ur', marja: 'SISTANI' } as User, question, 'unused');
  expect(retrieve).toHaveBeenCalledWith(question, 'OTHER', 'SISTANI');
  expect(result.mode).toBe('insufficient');
  expect(generate).not.toHaveBeenCalled();
});
