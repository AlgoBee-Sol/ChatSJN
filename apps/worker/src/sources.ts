import { extractText, getDocumentProxy } from 'unpdf';
import { sourceSchema, type Chunk, type Source } from '@sjn/shared';
import { AppError } from '../../api/src/errors.js';
import { normalizeSearch } from './search.js';
import { z } from 'zod';
import type { Env } from './env.js';

export type StoredSource = Source & {
  section: string;
  rulingNumber: string;
  rightsConfirmed: true;
  fileName: string;
  review?: {
    method: string;
    archiveId: string;
    textSha256: string;
    attribution: string;
    rightsBasis: string;
  };
};
export type SourceRow = { id: string; data: string; fileKey: string; status: string };
export async function getSource(env: Env, id: string) {
  const row = await env.DB.prepare('SELECT id,data,fileKey,status FROM sources WHERE id = ?')
    .bind(id)
    .first<SourceRow>();
  if (!row) throw new AppError(404, 'NOT_FOUND', 'Source not found.');
  return { row, source: JSON.parse(row.data) as StoredSource };
}
export async function extract(env: Env, id: string, bytes: ArrayBuffer, source: StoredSource) {
  try {
    let pages: string[];
    if (source.fileName.toLowerCase().endsWith('.pdf')) {
      const pdf = await getDocumentProxy(new Uint8Array(bytes));
      try {
        if (pdf.numPages > 150) throw new Error('PDFs must contain no more than 150 pages.');
        pages = (await extractText(pdf, { mergePages: false })).text;
      } finally {
        if ('destroy' in pdf && typeof pdf.destroy === 'function') await pdf.destroy();
      }
    } else pages = [new TextDecoder('utf-8', { fatal: true }).decode(bytes)];
    const chunks: Chunk[] = [];
    for (const [page, text] of pages.entries()) {
      if (text.includes('\0')) throw new Error('Upload a valid UTF-8 text or PDF document.');
      for (let offset = 0; offset < text.length; offset += 2160) {
        const originalText = text.slice(offset, offset + 2400).trim();
        if (originalText.length < 30) continue;
        chunks.push({
          _id: crypto.randomUUID(),
          chunkIndex: chunks.length,
          originalText,
          ...(source.fileName.toLowerCase().endsWith('.pdf') ? { pageNumber: page + 1 } : {}),
          section: source.section,
          rulingNumber: source.rulingNumber,
        });
        if (chunks.length > 500)
          throw new Error(
            'This beta supports up to 500 passages per source. Split this document before uploading.',
          );
      }
    }
    if (!chunks.length)
      throw new Error('No readable text found. Scanned PDFs need OCR before upload.');
    // Explicit FTS maintenance keeps unpublishing cheap: eligibility is checked at query time.
    const statements = [
      env.DB.prepare(
        "INSERT INTO chunk_search(chunk_search,rowid,searchText) SELECT 'delete',rowid,searchText FROM chunks WHERE documentId=?",
      ).bind(id),
      env.DB.prepare('DELETE FROM chunks WHERE documentId=?').bind(id),
    ];
    for (let i = 0; i < chunks.length; i += 20) {
      const batch = chunks.slice(i, i + 20);
      statements.push(
        env.DB.prepare(
          `INSERT INTO chunks (id,documentId,chunkIndex,data,searchText) VALUES ${batch.map(() => '(?,?,?,?,?)').join(',')}`,
        ).bind(
          ...batch.flatMap((c) => [
            c._id,
            id,
            c.chunkIndex,
            JSON.stringify(c),
            normalizeSearch(c.originalText),
          ]),
        ),
      );
    }
    statements.push(
      env.DB.prepare(
        'INSERT INTO chunk_search(rowid,searchText) SELECT rowid,searchText FROM chunks WHERE documentId=?',
      ).bind(id),
    );
    await env.DB.batch(statements);
    source.approvalStatus = 'READY_FOR_REVIEW';
    delete source.error;
  } catch (error) {
    source.approvalStatus = 'FAILED';
    source.error =
      error instanceof Error &&
      /PDFs must|Upload a valid|beta supports|No readable/.test(error.message)
        ? error.message
        : 'Document extraction failed. Check the file and retry.';
  }
  const at = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare('UPDATE sources SET status=?,data=? WHERE id=?').bind(
      source.approvalStatus,
      JSON.stringify(source),
      id,
    ),
    env.DB.prepare('INSERT INTO jobs (id,documentId,data,createdAt) VALUES (?,?,?,?)').bind(
      crypto.randomUUID(),
      id,
      JSON.stringify({
        status: source.approvalStatus === 'FAILED' ? 'FAILED' : 'COMPLETED',
        error: source.error,
        createdAt: at,
      }),
      at,
    ),
  ]);
  return source;
}
export async function uploadSource(env: Env, form: FormData, actorId: string) {
  const file = form.get('file'),
    raw = form.get('metadata');
  if (!(file instanceof File) || typeof raw !== 'string')
    throw new AppError(400, 'INVALID_UPLOAD', 'A file and source metadata are required.');
  if (file.size === 0 || file.size > 8 * 1024 * 1024)
    throw new AppError(413, 'FILE_SIZE', 'Choose a non-empty file up to 8 MB.');
  if (!/\.(pdf|txt|md)$/i.test(file.name))
    throw new AppError(400, 'FILE_TYPE', 'Only PDF, TXT and Markdown files are supported.');
  let metadata: unknown;
  try {
    metadata = JSON.parse(raw);
  } catch {
    throw new AppError(400, 'INVALID_METADATA', 'Source metadata must be valid JSON.');
  }
  const data = sourceSchema.parse(metadata),
    at = new Date().toISOString();
  const reviewRaw = form.get('review');
  const review =
    typeof reviewRaw === 'string'
      ? z
          .object({
            method: z.literal('automated-provenance-and-quality-review'),
            archiveId: z.string().regex(/^[a-f0-9]{24}$/),
            textSha256: z.string().regex(/^[a-f0-9]{64}$/),
            attribution: z.string().max(500),
            rightsBasis: z.literal(
              'Operator authorized source use; license not independently verified.',
            ),
          })
          .parse(JSON.parse(reviewRaw))
      : undefined;
  const bytes = await file.arrayBuffer();
  let id = crypto.randomUUID();
  if (review) {
    if (!/\.txt$/i.test(file.name))
      throw new AppError(400, 'FILE_TYPE', 'Archive imports require UTF-8 text.');
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/\n$/, '');
    const digest = async (value: string) =>
      Array.from(
        new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))),
        (b) => b.toString(16).padStart(2, '0'),
      ).join('');
    if ((await digest(text)) !== review.textSha256)
      throw new AppError(400, 'HASH_MISMATCH', 'The file differs from the reviewed archive.');
    const hash = await digest(`sjn-archive:${review.archiveId}:${review.textSha256}`);
    id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
    const existing = await env.DB.prepare('SELECT data FROM sources WHERE id=?')
      .bind(id)
      .first<{ data: string }>();
    if (existing) return JSON.parse(existing.data) as StoredSource;
  }
  const source: StoredSource = {
    ...data,
    ...(review ? { review } : {}),
    _id: id,
    fileName: file.name.slice(0, 200),
    approvalStatus: 'PROCESSING',
    createdAt: at,
    everPublished: false,
  };
  const key = `sources/${id}/${crypto.randomUUID()}/original`;
  if (/\.pdf$/i.test(file.name) && new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-')
    throw new AppError(400, 'FILE_TYPE', 'This file is not a valid PDF.');
  await env.UPLOADS.put(key, bytes, { httpMetadata: { contentType: 'application/octet-stream' } });
  try {
    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO sources(id,title,status,authority,category,data,fileKey,createdAt) VALUES(?,?,?,?,?,?,?,?)',
      ).bind(
        id,
        data.title,
        source.approvalStatus,
        data.religiousAuthorityId,
        data.sourceCategory,
        JSON.stringify(source),
        key,
        at,
      ),
      env.DB.prepare(
        'INSERT INTO audit_logs(id,actorId,action,documentId,createdAt) VALUES(?,?,?,?,?)',
      ).bind(crypto.randomUUID(), actorId, 'upload', id, at),
    ]);
  } catch (error) {
    await env.UPLOADS.delete(key);
    if (review) {
      const existing = await env.DB.prepare('SELECT data FROM sources WHERE id=?')
        .bind(id)
        .first<{ data: string }>();
      if (existing) return JSON.parse(existing.data) as StoredSource;
    }
    throw error;
  }
  return extract(env, id, bytes, source);
}
export async function sourceAction(env: Env, id: string, action: string, actorId: string) {
  const lease = crypto.randomUUID(),
    now = Date.now();
  const lock = await env.DB.prepare(
    'UPDATE sources SET lease=?,busyUntil=? WHERE id=? AND busyUntil < ?',
  )
    .bind(lease, now + 15 * 60000, id, now)
    .run();
  if (!lock.meta.changes)
    throw new AppError(
      409,
      'SOURCE_BUSY',
      'Source not found or another source operation is running.',
    );
  try {
    const { row, source } = await getSource(env, id);
    if (action === 'reprocess') {
      if (source.everPublished)
        throw new AppError(
          409,
          'IMMUTABLE_SOURCE',
          'Upload a new version of a previously published source.',
        );
      const object = await env.UPLOADS.get(row.fileKey);
      if (!object) throw new AppError(404, 'MISSING_FILE', 'The original upload is unavailable.');
      return await extract(env, id, await object.arrayBuffer(), source);
    }
    if (action === 'approve') {
      if (row.status !== 'READY_FOR_REVIEW')
        throw new AppError(
          409,
          'INVALID_STATUS',
          'Only reviewed, extracted sources can be approved.',
        );
      const chunks = await env.DB.prepare(
        'SELECT id,data FROM chunks WHERE documentId=? ORDER BY chunkIndex',
      )
        .bind(id)
        .all<{ id: string; data: string }>();
      if (!chunks.results.length)
        throw new AppError(409, 'EMPTY_SOURCE', 'This source has no extracted passages.');
      const indexed = await env.DB.prepare(
        'SELECT count(*) AS n FROM chunks WHERE documentId=? AND length(searchText)>0',
      )
        .bind(id)
        .first<{ n: number }>();
      if (indexed?.n !== chunks.results.length)
        throw new AppError(409, 'INDEX_INCOMPLETE', 'Reprocess this source before approval.');
      source.approvalStatus = 'APPROVED';
      source.everPublished = true;
    } else if (action === 'reject' && ['READY_FOR_REVIEW', 'FAILED'].includes(row.status))
      source.approvalStatus = 'REJECTED';
    else if (action === 'unpublish' && row.status === 'APPROVED')
      source.approvalStatus = 'READY_FOR_REVIEW';
    else throw new AppError(409, 'INVALID_STATUS', 'This action is not available for the source.');
    source.reviewedAt = new Date().toISOString();
    source.reviewedBy = actorId;
    await env.DB.batch([
      env.DB.prepare('UPDATE sources SET data=?,status=? WHERE id=? AND lease=?').bind(
        JSON.stringify(source),
        source.approvalStatus,
        id,
        lease,
      ),
      env.DB.prepare(
        'INSERT INTO audit_logs(id,actorId,action,documentId,createdAt) VALUES(?,?,?,?,?)',
      ).bind(crypto.randomUUID(), actorId, action, id, source.reviewedAt),
    ]);
    return source;
  } finally {
    await env.DB.prepare('UPDATE sources SET lease=NULL,busyUntil=0 WHERE id=? AND lease=?')
      .bind(id, lease)
      .run();
  }
}
