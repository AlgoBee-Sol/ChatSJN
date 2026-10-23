import 'dotenv/config';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3001),
  MONGODB_URI: z.string().default('mongodb://127.0.0.1:27017/sjn_ai'),
  APP_ORIGIN: z.url().default('http://localhost:5173'),
  BETTER_AUTH_SECRET: z.string().min(32).default(randomBytes(48).toString('hex')),
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  OPENAI_API_KEY: z.string().default(''),
  OPENAI_BASE_URL: z.url().default('https://api.openai.com/v1'),
  LLM_MODEL: z.string().default('gpt-4.1-mini'),
  EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  RAG_SEARCH_BACKEND: z.enum(['local']).default('local'),
  RAG_MIN_SCORE: z.coerce.number().min(0).max(1).default(0.45),
  UPLOAD_DIR: z.string().default('.local/uploads'),
  CHUNK_SIZE: z.coerce.number().int().min(200).max(8000).default(1600),
  CHUNK_OVERLAP: z.coerce.number().int().min(0).default(200),
});
export const config = schema.parse(process.env);
if (config.CHUNK_OVERLAP >= config.CHUNK_SIZE)
  throw new Error('CHUNK_OVERLAP must be smaller than CHUNK_SIZE');
if (Boolean(config.GOOGLE_CLIENT_ID) !== Boolean(config.GOOGLE_CLIENT_SECRET))
  throw new Error('Set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable Google sign-in');
if (
  config.NODE_ENV === 'production' &&
  (!process.env.BETTER_AUTH_SECRET ||
    config.BETTER_AUTH_SECRET.startsWith('replace-') ||
    !process.env.MONGODB_URI ||
    !config.APP_ORIGIN.startsWith('https://'))
)
  throw new Error(
    'Production requires a real BETTER_AUTH_SECRET, MONGODB_URI and HTTPS APP_ORIGIN',
  );
