import { z } from 'zod';
import type { Citation, Topic, User } from '@sjn/shared';
import { AnswerGenerator } from '../../api/src/rag/generator.js';
import { QuestionClassifier, SourceAuthorityResolver, messages } from '../../api/src/rag/policy.js';
import { AppError } from '../../api/src/errors.js';
import type { Env } from './env.js';
import { extractUrduKeywords, knownUrduKeywords, searchExpression } from './search.js';

export const EMBEDDING_MODEL = '@cf/baai/bge-m3';
export const GENERATION_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
export async function embed(env: Env, text: string[]) {
  const result = z
    .object({ data: z.array(z.array(z.number().finite()).length(1024)) })
    .parse(await env.AI.run(EMBEDDING_MODEL, { text }));
  if (result.data.length !== text.length)
    throw new AppError(502, 'EMBEDDING_FAILED', 'Source indexing is temporarily unavailable.');
  return result.data;
}
export function cosine(a: number[], b: number[]) {
  if (!a.length || a.length !== b.length) return -1;
  const norm = Math.hypot(...a) * Math.hypot(...b);
  return norm ? a.reduce((sum, v, i) => sum + v * b[i], 0) / norm : -1;
}
export async function retrieve(
  env: Env,
  question: string,
  category: Topic,
  user: User,
): Promise<Citation[]> {
  const filter = new SourceAuthorityResolver().resolve(category, user.marja);
  const eligible = await env.DB.prepare(
    "SELECT id FROM sources WHERE status='APPROVED' AND authority=? AND category=? AND EXISTS (SELECT 1 FROM json_each(data, '$.topics') WHERE value=?) LIMIT 1",
  )
    .bind(filter.religiousAuthorityId, filter.sourceCategory, category)
    .first();
  if (!eligible) return [];
  // Translate only search keywords. Authority and topic filters never come from the model.
  const known = knownUrduKeywords(question);
  let terms = `${known.join(' ')} ${question}`;
  if (!known.length && !/[\u0600-\u06ff]/.test(question)) {
    const translated: unknown = await env.AI.run(GENERATION_MODEL, {
      messages: [
        {
          role: 'system',
          content:
            'Translate the specific concepts asked about into Urdu written in Arabic script. Input may be English or Roman Urdu. Return ONLY 1 to 3 Urdu search terms separated by commas. Every term must contain Urdu/Arabic letters: for example education becomes تعلیم. Convert Roman Urdu into Urdu script, not English. Exclude general topic labels and loosely related concepts. No answer, JSON, numbering or commentary.',
        },
        { role: 'user', content: JSON.stringify({ searchQuestion: question }) },
      ],
      max_tokens: 90,
      temperature: 0,
    });
    try {
      const response = z
        .object({ response: z.union([z.string(), z.record(z.string(), z.unknown())]) })
        .parse(translated).response;
      terms = `${extractUrduKeywords(response).join(' ')} ${question}`;
    } catch {
      /* Original-language search remains available if translation is malformed. */
    }
  }
  const expression = searchExpression(terms);
  if (!expression) return [];
  const rows = await env.DB.prepare(
    `SELECT c.id, c.data, c.embedding, c.embeddingModel, s.id AS documentId, s.data AS source
     FROM chunk_search JOIN chunks c ON c.rowid=chunk_search.rowid JOIN sources s ON s.id=c.documentId
     WHERE chunk_search MATCH ? AND s.status='APPROVED' AND s.authority=? AND s.category=?
     AND EXISTS (SELECT 1 FROM json_each(s.data, '$.topics') WHERE value=?)
     ORDER BY bm25(chunk_search) LIMIT 12`,
  )
    .bind(expression, filter.religiousAuthorityId, filter.sourceCategory, category)
    .all<{
      id: string;
      data: string;
      embedding: string | null;
      embeddingModel: string | null;
      documentId: string;
      source: string;
    }>();
  if (!rows.results.length) return [];
  const missing = rows.results.filter(
    (row) => row.embeddingModel !== EMBEDDING_MODEL || !row.embedding,
  );
  const [vector, ...vectors] = await embed(env, [
    question,
    ...missing.map((row) => JSON.parse(row.data).originalText),
  ]);
  if (missing.length)
    await env.DB.batch(
      missing.map((row, i) => {
        row.embedding = JSON.stringify(vectors[i]);
        return env.DB.prepare('UPDATE chunks SET embedding=?,embeddingModel=? WHERE id=?').bind(
          row.embedding,
          EMBEDDING_MODEL,
          row.id,
        );
      }),
    );
  return rows.results
    .map((row) => ({ row, score: cosine(JSON.parse(row.embedding!), vector) }))
    .filter(({ score }) => score >= 0.45)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ row }) => {
      const source = JSON.parse(row.source),
        chunk = JSON.parse(row.data);
      return {
        chunkId: row.id,
        documentId: row.documentId,
        title: source.title,
        scholar: source.scholar,
        url: source.originalSourceURL,
        originalText: chunk.originalText,
        pageNumber: chunk.pageNumber,
        section: chunk.section,
        rulingNumber: chunk.rulingNumber,
        version: source.version,
        authority: source.religiousAuthorityId,
      };
    });
}
export async function answer(env: Env, user: User, question: string, conversationId: string) {
  const classifier = new QuestionClassifier(),
    category = classifier.classify(question),
    language = classifier.language(question, user.language);
  const base = { category, language, marjaSnapshot: user.marja };
  if (classifier.deceasedTaqlid(question))
    return { ...base, content: messages.deceased[language], citations: [], mode: 'guidance' };
  if (category === 'OTHER')
    return { ...base, content: messages.clarify[language], citations: [], mode: 'clarification' };
  const evidence = await retrieve(env, question, category, user);
  const previous = await env.DB.prepare(
    "SELECT data FROM messages WHERE conversationId = ? AND role = 'user' ORDER BY createdAt DESC LIMIT 4",
  )
    .bind(conversationId)
    .all<{ data: string }>();
  const generator = new AnswerGenerator({
    generate: async (system, input) => {
      const raw: unknown = await env.AI.run(GENERATION_MODEL, {
        messages: [
          {
            role: 'system',
            content: `${system} For this interface return quotes: []. Language codes: roman means Roman Urdu (Urdu written with Latin letters), ur means Urdu in Arabic script, en means English. Historical sources reflect their publication context.`,
          },
          { role: 'user', content: input },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 1800,
        temperature: 0.1,
      });
      const parsed = z
        .object({ response: z.union([z.string(), z.record(z.string(), z.unknown())]) })
        .parse(raw);
      return typeof parsed.response === 'string' ? JSON.parse(parsed.response) : parsed.response;
    },
  });
  const result = await generator.generate(
    question,
    language,
    user.marja,
    category,
    evidence,
    previous.results.reverse().map((row) => {
      const m = JSON.parse(row.data);
      return { role: m.role, content: m.content };
    }),
  );
  for (const id of new Set(result.citations.map((c) => c.documentId))) {
    const current = await env.DB.prepare(
      "SELECT id FROM sources WHERE id = ? AND status = 'APPROVED'",
    )
      .bind(id)
      .first();
    if (!current)
      throw new AppError(
        409,
        'SOURCE_CHANGED',
        'A source changed during verification. Please retry.',
      );
  }
  return { ...base, ...result };
}
