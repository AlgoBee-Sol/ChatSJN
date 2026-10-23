import { SourceDocument, SourceChunk } from '../src/models.js';
import type { Providers } from '../src/rag/providers.js';
// Exclusively imported by tests. These are synthetic assertions, never religious material.
export const testProviders: Providers = {
  configured: true,
  embeddings: {
    model: 'synthetic-test-v1',
    async embed(texts) {
      return texts.map((text) => (text.includes('unrelated') ? [0, 1, 0] : [1, 0, 0]));
    },
  },
  llm: {
    async generate(_system, input) {
      const data = JSON.parse(input) as { evidence: { chunkId: string }[] };
      return {
        explanation:
          'SYNTHETIC TEST ANSWER — This verifies the citation pipeline, not a religious ruling.',
        citationIds: data.evidence.map((c) => c.chunkId),
        quotes: [],
        insufficient: false,
      };
    },
  },
};
export async function seedFixture(
  authority: 'SISTANI' | 'ALI_KHAMENEI' | 'JAWAD_NAQVI' = 'SISTANI',
  status: 'APPROVED' | 'DRAFT' = 'APPROVED',
  text = 'SYNTHETIC TEST FIXTURE: A wudu example used solely to exercise retrieval, never a real ruling.',
) {
  const doc = await SourceDocument.create({
    title: `SYNTHETIC ${authority} fixture`,
    scholar: 'Synthetic test author',
    sourceCategory: authority === 'JAWAD_NAQVI' ? 'EDUCATIONAL' : 'FIQH',
    religiousAuthorityId: authority,
    topics: [authority === 'JAWAD_NAQVI' ? 'AKHLAQ' : 'FIQH'],
    language: 'en',
    originalSourceURL: 'https://example.org/synthetic-test-fixture',
    sourceType: 'txt',
    version: 'test-1',
    approvalStatus: status,
    everPublished: status === 'APPROVED',
  });
  const chunk = await SourceChunk.create({
    documentId: doc._id,
    originalText: text,
    normalizedText: text,
    chunkIndex: 0,
    embedding: [1, 0, 0],
    embeddingModel: 'synthetic-test-v1',
    section: 'Synthetic section',
    rulingNumber: 'TEST-ONLY',
  });
  return { doc, chunk };
}
export function syntheticPdf(
  text = 'SYNTHETIC PDF TEST ONLY: This passage is not religious guidance.',
) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  const stream = `BT /F1 12 Tf 50 700 Td (${text}) Tj ET`;
  objects.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((o) => `${o.toString().padStart(10, '0')} 00000 n \n`)
    .join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}
