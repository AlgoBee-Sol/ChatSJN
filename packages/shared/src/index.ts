import { z } from 'zod';
export const marjaSchema = z.enum(['SISTANI', 'ALI_KHAMENEI']);
export const languageSchema = z.enum(['ur', 'en', 'roman']);
export const topicSchema = z.enum([
  'FIQH',
  'AQAID',
  'QURAN',
  'HADITH',
  'HISTORY',
  'AKHLAQ',
  'OTHER',
]);
export type Marja = z.infer<typeof marjaSchema>;
export type Language = z.infer<typeof languageSchema>;
export type Topic = z.infer<typeof topicSchema>;
export { MARJAS, LANGUAGES } from './display.js';
export const registerSchema = z.object({
  email: z
    .email()
    .max(254)
    .transform((v) => v.toLowerCase().trim()),
  password: z.string().min(12).max(128),
  age: z.number().int().min(18, 'This private beta is for adults aged 18 and over.').max(120),
});
export const loginSchema = registerSchema.pick({ email: true, password: true });
export const profileSchema = z
  .object({
    fullName: z.string().trim().min(2).max(80).optional(),
    gender: z.enum(['Male', 'Female', 'Prefer not to say']).optional(),
    age: z.number().int().min(18).max(120).optional(),
    marja: marjaSchema.optional(),
    language: languageSchema.optional(),
    onboardingStep: z.number().int().min(1).max(4).optional(),
    complete: z.boolean().optional(),
  })
  .strict();
export const questionSchema = z.object({
  question: z.string().trim().min(2).max(4000),
  requestId: z.uuid(),
});
export const sourceSchema = z
  .object({
    title: z.string().trim().min(3).max(200),
    scholar: z.string().trim().min(2).max(150),
    sourceCategory: z.enum(['FIQH', 'EDUCATIONAL']),
    religiousAuthorityId: z.enum(['SISTANI', 'ALI_KHAMENEI', 'JAWAD_NAQVI']),
    topics: z.array(topicSchema).min(1),
    language: languageSchema,
    originalSourceURL: z
      .url()
      .refine((v) => v.startsWith('https://'), 'An HTTPS provenance URL is required.'),
    publication: z.string().max(500).default(''),
    version: z.string().min(1).max(40).default('1'),
    section: z.string().max(200).default(''),
    rulingNumber: z.string().max(50).default(''),
    rightsConfirmed: z.literal(true),
  })
  .refine(
    (v) =>
      v.sourceCategory === 'FIQH'
        ? v.religiousAuthorityId !== 'JAWAD_NAQVI' && v.topics.every((t) => t === 'FIQH')
        : v.religiousAuthorityId === 'JAWAD_NAQVI' && !v.topics.includes('FIQH'),
    'Source category, topics and authority must agree.',
  );
export type ProfileInput = z.infer<typeof profileSchema>;
export type User = {
  id: string;
  email: string;
  fullName: string;
  gender: string;
  age: number | null;
  marja: Marja;
  language: Language;
  role: 'USER' | 'ADMIN';
  onboardingStep: number;
  onboardingComplete: boolean;
};
export type Citation = {
  chunkId: string;
  documentId: string;
  title: string;
  scholar: string;
  url: string;
  originalText: string;
  pageNumber?: number;
  section: string;
  rulingNumber: string;
  version: string;
  authority: string;
};
export type Message = {
  _id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: Citation[];
  marjaSnapshot: Marja;
  language: Language;
  category: Topic;
  createdAt: string;
  mode?: string;
};
export type Conversation = { _id: string; title: string; updatedAt: string };
export type Source = {
  _id: string;
  title: string;
  scholar: string;
  sourceCategory: string;
  religiousAuthorityId: string;
  topics: Topic[];
  language: Language;
  originalSourceURL: string;
  publication: string;
  version: string;
  approvalStatus: string;
  error?: string;
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  everPublished: boolean;
};
export type Chunk = {
  _id: string;
  originalText: string;
  pageNumber?: number;
  section: string;
  rulingNumber: string;
  chunkIndex: number;
};
