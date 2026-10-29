import { describe, expect, it, vi } from 'vitest';
import type { Citation, User } from '@sjn/shared';
import { QuestionClassifier, messages } from '../src/rag/policy.js';
import { ChatService } from '../src/rag/chat-service.js';
import { AnswerGenerator } from '../src/rag/generator.js';

const exactQuestion =
  'ایران کے اندر عظیم انقلاب کے رونما ہونے کے سلسلے میں کیا راجح اور چند غیر راجح نظریات پائے جاتے ہیں؟';
describe('clarity is independent of subject classification', () => {
  it.each([
    exactQuestion,
    'What prevalent and less prevalent theories explain the emergence of the revolution in Iran?',
    'Iran mein inqilab ke barpa hone ke mutaliq raij aur ghair raij nazriyat kya hain?',
    'Explain the causes of social alienation',
    'What is Zorblax?',
  ])('searches unfamiliar but explicit subjects: %s', (question) => {
    const c = new QuestionClassifier();
    expect(c.classify(question)).toBe('OTHER');
    expect(c.needsClarification(question)).toBe(false);
  });
  it.each([
    ['What about it?', 'en'],
    ['اس کے بارے میں بتائیں', 'ur'],
    ['Is ke bare mein batayein?', 'roman'],
  ] as const)(
    'clarifies an absent subject without calling providers: %s',
    async (question, language) => {
      const embed = vi.fn(),
        generate = vi.fn();
      const service = new ChatService({
        configured: false,
        embeddings: { model: 'test', embed },
        llm: { generate },
      });
      const result = await service.answer(
        { language, marja: 'SISTANI' } as User,
        question,
        'unused',
      );
      expect(result.mode).toBe('clarification');
      expect(result.content).toBe(messages.clarify[language]);
      expect(embed).not.toHaveBeenCalled();
      expect(generate).not.toHaveBeenCalled();
    },
  );
  it('does not mistake missing evidence for ambiguity', async () => {
    const generate = vi.fn();
    const result = await new AnswerGenerator({ generate }).generate(
      exactQuestion,
      'ur',
      'SISTANI',
      'OTHER',
      [],
    );
    expect(result.mode).toBe('insufficient');
    expect(result.content).toBe(messages.insufficient.ur);
    expect(generate).not.toHaveBeenCalled();
  });
  it('requires conflicts to remain attributed and validates both citations', async () => {
    const evidence: Citation[] = ['A', 'B'].map((id) => ({
      chunkId: id,
      documentId: id,
      title: `Synthetic ${id}`,
      scholar: 'Test author',
      url: '',
      originalText: `Synthetic conflicting account ${id}`,
      section: '',
      rulingNumber: '',
      version: '1',
      authority: 'JAWAD_NAQVI',
    }));
    const generate = vi.fn(async (system: string, input: string) => {
      expect(system).toContain('If passages conflict');
      expect(system).toContain('A retrieval score is not scholarly preference');
      expect(system).toContain('Do not silently replace a term');
      expect(JSON.parse(input).evidence).toEqual(evidence);
      return {
        explanation:
          'The two supplied accounts disagree; the evidence does not settle their disagreement.',
        citationIds: ['A', 'B'],
        quotes: [],
        insufficient: false,
      };
    });
    const result = await new AnswerGenerator({ generate }).generate(
      'Compare the accounts',
      'en',
      'SISTANI',
      'OTHER',
      evidence,
    );
    expect(result.citations).toEqual(evidence);
    expect(result.mode).toBe('grounded');
  });
});

it('abstains when an answer silently equates rajih with raij', async () => {
  const source: Citation = {
    chunkId: 'terms',
    documentId: 'terms',
    title: 'Synthetic wording check',
    scholar: 'Test author',
    url: '',
    originalText: 'Synthetic fixture: رائج نظریات',
    section: '',
    rulingNumber: '',
    version: '1',
    authority: 'JAWAD_NAQVI',
  };
  const generate = vi.fn(async (system: string) => {
    expect(system).toContain('SPECIFIC WORDING CHECK');
    return {
      explanation: 'راجح نظریات یہ ہیں۔',
      citationIds: ['terms'],
      quotes: [],
      insufficient: false,
    };
  });
  const result = await new AnswerGenerator({ generate }).generate(
    exactQuestion,
    'ur',
    'SISTANI',
    'OTHER',
    [source],
  );
  expect(result.mode).toBe('insufficient');
  expect(result.citations).toEqual([]);
  expect(result.content).toContain('الگ معنی');
});

it('does not impose a wording mismatch when the source actually uses rajih', async () => {
  const source: Citation = {
    chunkId: 'terms',
    documentId: 'terms',
    title: 'Synthetic wording check',
    scholar: 'Test author',
    url: '',
    originalText: 'Synthetic fixture: راجح نظریات',
    section: '',
    rulingNumber: '',
    version: '1',
    authority: 'JAWAD_NAQVI',
  };
  const generate = vi.fn(async (system: string) => {
    expect(system).not.toContain('SPECIFIC WORDING CHECK');
    return {
      explanation: 'Synthetic supported preference.',
      citationIds: ['terms'],
      quotes: [],
      insufficient: false,
    };
  });
  expect(
    (
      await new AnswerGenerator({ generate }).generate(exactQuestion, 'ur', 'SISTANI', 'OTHER', [
        source,
      ])
    ).mode,
  ).toBe('grounded');
});
