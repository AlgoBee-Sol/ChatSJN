import { readFile } from 'node:fs/promises';
import { SourceDocument, SourceChunk, IngestionJob } from './models.js';
import { config } from './config.js';
import { normalize } from './rag/policy.js';
import type { EmbeddingProvider } from './rag/providers.js';
import { AppError } from './errors.js';
export function chunkText(text: string, size = config.CHUNK_SIZE, overlap = config.CHUNK_OVERLAP) {
  const chunks: string[] = [];
  for (let start = 0; start < text.length; start += size - overlap) {
    const piece = text.slice(start, start + size).trim();
    if (piece) chunks.push(piece);
    if (start + size >= text.length) break;
  }
  return chunks;
}
export async function extract(data: Buffer, type: string) {
  if (type === 'pdf') {
    if (data.subarray(0, 5).toString() !== '%PDF-') throw new Error('Invalid PDF signature.');
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data });
    try {
      const result = await parser.getText();
      if (result.pages.length > 150)
        throw new Error('Maximum 150 pages per import. Split this document first.');
      return result.pages.map((page) => ({ text: page.text, pageNumber: page.num }));
    } finally {
      await parser.destroy();
    }
  }
  const text = new TextDecoder('utf-8', { fatal: true }).decode(data);
  if (text.includes('\0')) throw new Error('Unsupported binary content. Upload UTF-8 text.');
  return [{ text, pageNumber: undefined }];
}
export async function ingest(id: string) {
  const doc = await SourceDocument.findOneAndUpdate(
    { _id: id, everPublished: false, approvalStatus: { $nin: ['PROCESSING', 'APPROVED'] } },
    { $set: { approvalStatus: 'PROCESSING', error: '' } },
    { returnDocument: 'after' },
  ).select('+filePath');
  if (!doc)
    throw new AppError(
      409,
      'SOURCE_LOCKED',
      'Published or processing documents cannot be reprocessed. Upload a new version.',
    );
  const job = await IngestionJob.create({ documentId: id, status: 'PROCESSING' });
  try {
    const pages = await extract(await readFile(doc.filePath!), doc.sourceType || 'txt');
    if (pages.some((p) => p.text.trim().length < 20))
      throw new Error(
        'A page has little or no extractable text. Scanned or mixed PDFs require manual transcription/OCR before import.',
      );
    if (pages.some((p) => (p.text.match(/�/g)?.length || 0) > 2))
      throw new Error(
        'Text encoding appears corrupted. Please supply a verified UTF-8 transcript.',
      );
    await SourceChunk.deleteMany({ documentId: id });
    const chunks = pages.flatMap((p) =>
      chunkText(p.text).map((text) => ({
        documentId: id,
        originalText: text,
        normalizedText: normalize(text),
        pageNumber: p.pageNumber,
        section: doc.section,
        rulingNumber: doc.rulingNumber,
      })),
    );
    if (!chunks.length || chunks.length > 1000)
      throw new Error('Import must contain between 1 and 1000 text chunks.');
    await SourceChunk.insertMany(chunks.map((c, i) => ({ ...c, chunkIndex: i })));
    doc.approvalStatus = 'READY_FOR_REVIEW';
    job.status = 'READY_FOR_REVIEW';
  } catch (error) {
    doc.approvalStatus = 'FAILED';
    doc.error = error instanceof Error ? error.message : 'Extraction failed';
    job.status = 'FAILED';
    job.error = doc.error;
  }
  job.finishedAt = new Date();
  await job.save();
  await doc.save();
  return doc;
}
export async function embedDocument(id: string, provider: EmbeddingProvider) {
  const chunks = await SourceChunk.find({ documentId: id }).sort({ chunkIndex: 1 });
  if (!chunks.length) throw new AppError(409, 'NO_CHUNKS', 'No extracted passages are available.');
  for (let i = 0; i < chunks.length; i += 20) {
    const batch = chunks.slice(i, i + 20);
    const vectors = await provider.embed(batch.map((c) => c.normalizedText || c.originalText));
    for (let j = 0; j < batch.length; j++) {
      batch[j].embedding = vectors[j];
      batch[j].embeddingModel = provider.model;
      await batch[j].save();
    }
  }
}
