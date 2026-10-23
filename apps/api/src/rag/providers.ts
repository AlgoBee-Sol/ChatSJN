import { z } from 'zod';
import { config } from '../config.js';
import { AppError } from '../errors.js';
export interface EmbeddingProvider {
  readonly model: string;
  embed(texts: string[]): Promise<number[][]>;
}
export interface LLMProvider {
  generate(system: string, input: string): Promise<unknown>;
}
async function request(path: string, body: unknown) {
  if (!config.OPENAI_API_KEY)
    throw new AppError(
      503,
      'AI_NOT_CONFIGURED',
      'AI is not connected yet. An administrator needs to configure the model API key. Your conversations and account are available.',
    );
  try {
    const response = await fetch(`${config.OPENAI_BASE_URL.replace(/\/$/, '')}/${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok) throw new Error('provider');
    return await response.json();
  } catch {
    throw new AppError(
      502,
      'AI_UNAVAILABLE',
      'The AI provider is unavailable. Please try again shortly.',
    );
  }
}
export class CompatibleEmbeddings implements EmbeddingProvider {
  model = config.EMBEDDING_MODEL;
  async embed(texts: string[]) {
    const raw = await request('embeddings', { model: this.model, input: texts });
    const result = z
      .object({
        data: z.array(
          z.object({ index: z.number(), embedding: z.array(z.number().finite()).min(1) }),
        ),
      })
      .parse(raw);
    const vectors = result.data.sort((a, b) => a.index - b.index).map((x) => x.embedding);
    if (vectors.length !== texts.length)
      throw new AppError(
        502,
        'INVALID_EMBEDDING',
        'The embedding provider returned incomplete results.',
      );
    return vectors;
  }
}
export class CompatibleLLM implements LLMProvider {
  async generate(system: string, input: string) {
    const raw = await request('chat/completions', {
      model: config.LLM_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: input },
      ],
      response_format: { type: 'json_object' },
      max_completion_tokens: 1800,
    });
    const data = z
      .object({ choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1) })
      .parse(raw);
    try {
      return JSON.parse(data.choices[0].message.content) as unknown;
    } catch {
      throw new AppError(
        502,
        'INVALID_ANSWER',
        'The AI returned an invalid response. Please retry.',
      );
    }
  }
}
export type Providers = { embeddings: EmbeddingProvider; llm: LLMProvider; configured: boolean };
export const productionProviders: Providers = {
  embeddings: new CompatibleEmbeddings(),
  llm: new CompatibleLLM(),
  configured: Boolean(config.OPENAI_API_KEY),
};
