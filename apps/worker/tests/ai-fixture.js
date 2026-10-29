// Isolated runtime test double. Never bundled into the deployed Worker.
import { WorkerEntrypoint } from 'cloudflare:workers';
export default class AI extends WorkerEntrypoint {
  async run(model, input) {
    if (model.includes('bge-m3'))
      return {
        data: input.text.map((text) =>
          Array.from({ length: 1024 }, (_, i) =>
            i === (text.includes('SEMANTIC_MISS') ? 1 : 0) ? 1 : 0,
          ),
        ),
      };
    const { searchQuestion, evidence, question } = JSON.parse(input.messages[1].content);
    if (searchQuestion) {
      if (searchQuestion.includes('chronometry')) throw new Error('Synthetic translation outage');
      if (searchQuestion.includes('epistemology')) return { response: 'معرفت' };
      return { response: { terms: [] } };
    }
    return {
      response: {
        explanation: 'The supplied synthetic passage describes honesty.',
        citationIds: question.includes('inventcitation')
          ? ['invented']
          : question.includes('conflicting')
            ? evidence.map((e) => e.chunkId)
            : [evidence[0].chunkId],
        quotes: [],
        insufficient: false,
      },
    };
  }
}
