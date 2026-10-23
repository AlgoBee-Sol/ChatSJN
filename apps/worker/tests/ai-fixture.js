// Isolated runtime test double. Never bundled into the deployed Worker.
import { WorkerEntrypoint } from 'cloudflare:workers';
export default class AI extends WorkerEntrypoint {
  async run(model, input) {
    if (model.includes('bge-m3')) return { data: input.text.map(() => Array(1024).fill(0.01)) };
    if (JSON.parse(input.messages[1].content).searchQuestion) return { response: { terms: [] } };
    const { evidence } = JSON.parse(input.messages[1].content);
    return {
      response: {
        explanation: 'The supplied synthetic passage describes honesty.',
        citationIds: [evidence[0].chunkId],
        quotes: [],
        insufficient: false,
      },
    };
  }
}
