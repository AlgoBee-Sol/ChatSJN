import type { User } from '@sjn/shared';
import { FIQH_ENABLED } from '@sjn/shared/features';
import { SourceDocument, MessageModel } from '../models.js';
import { AppError } from '../errors.js';
import { QuestionClassifier, messages } from './policy.js';
import { KnowledgeRetriever } from './retriever.js';
import { AnswerGenerator } from './generator.js';
import type { Providers } from './providers.js';
export class ChatService {
  constructor(private providers: Providers) {}
  async answer(user: User, question: string, conversationId: string) {
    const classifier = new QuestionClassifier();
    const category = classifier.classify(question);
    const language = classifier.language(question, user.language);
    const base = { category, language, marjaSnapshot: user.marja };
    if (!FIQH_ENABLED && (category === 'FIQH' || classifier.deceasedTaqlid(question)))
      return { ...base, content: messages.fiqhPaused[language], citations: [], mode: 'guidance' };
    if (!this.providers.configured)
      throw new AppError(
        503,
        'AI_NOT_CONFIGURED',
        'AI is not connected yet. Ask your administrator to configure an AI provider. No religious answer has been generated.',
      );
    if (classifier.deceasedTaqlid(question))
      return { ...base, content: messages.deceased[language], citations: [], mode: 'guidance' };
    if (FIQH_ENABLED && category === 'OTHER')
      return { ...base, content: messages.clarify[language], citations: [], mode: 'clarification' };
    const evidence = await new KnowledgeRetriever(this.providers.embeddings).retrieve(
      question,
      category,
      user.marja,
    );
    const previous = await MessageModel.find({ conversationId, role: 'user' })
      .sort({ createdAt: -1 })
      .limit(4)
      .lean();
    const answer = await new AnswerGenerator(this.providers.llm).generate(
      question,
      language,
      user.marja,
      category,
      evidence,
      previous.reverse().map((m) => ({ role: m.role, content: m.content })),
    );
    const current = await SourceDocument.countDocuments({
      _id: { $in: answer.citations.map((c) => c.documentId) },
      approvalStatus: 'APPROVED',
    });
    if (current !== new Set(answer.citations.map((c) => c.documentId)).size)
      throw new AppError(
        409,
        'SOURCE_CHANGED',
        'A source changed during verification. Please retry.',
      );
    return { ...base, ...answer };
  }
}
