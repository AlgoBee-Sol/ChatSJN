// Run this function through the authenticated Cloudflare connector, not a public endpoint.
// Originals go to private R2. Publication occurs only after all index writes succeed.
export default async function importReviewedBatch(cloudflare, accountId, encoded) {
  const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  const entries = await new Response(
    new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')),
  ).json();
  if (accountId !== '70f8868a0c41eedd3481da031af7d6cd' || entries.length > 10)
    throw new Error('Unexpected import target or batch size');
  const base = `/accounts/${accountId}`;
  const dbPath = `${base}/d1/database/b679fbdb-2e8f-477e-8ee5-7b8e5642a0c1/query`;
  const digest = async (text) =>
    Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))),
      (b) => b.toString(16).padStart(2, '0'),
    ).join('');
  const uuid = (hash) =>
    `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
  const normalize = (text) =>
    text
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[\u064b-\u065f\u0670\u0640]/g, '')
      .replace(/ي/g, 'ی')
      .replace(/ك/g, 'ک')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  const query = async (batch) => {
    const r = await cloudflare.request({ method: 'POST', path: dbPath, body: { batch } });
    if (!r.success || r.result.some((x) => !x.success)) throw new Error('D1 batch failed');
    return r.result;
  };
  for (const entry of entries) {
    if ((await digest(entry.text.replace(/\n$/, ''))) !== entry.review.textSha256)
      throw new Error('Hash mismatch');
    if (
      entry.metadata.sourceCategory !== 'EDUCATIONAL' ||
      entry.metadata.religiousAuthorityId !== 'JAWAD_NAQVI' ||
      entry.metadata.topics.includes('FIQH') ||
      new URL(entry.metadata.originalSourceURL).hostname !== 'www.syedjawadnaqvi.com'
    )
      throw new Error('Invalid archive scope');
    entry.id = uuid(
      await digest(`sjn-archive:${entry.review.archiveId}:${entry.review.textSha256}`),
    );
  }
  const existing = (
    await query([
      {
        sql: `SELECT id,status,data FROM sources WHERE id IN (${entries.map(() => '?').join(',')})`,
        params: entries.map((x) => x.id),
      },
    ])
  )[0].results;
  const skip = new Set(existing.filter((x) => x.status === 'APPROVED').map((x) => x.id));
  for (const row of existing) {
    if (!skip.has(row.id) && (JSON.parse(row.data).everPublished || row.status === 'REJECTED'))
      throw new Error('Preserving explicitly unpublished/rejected source');
  }
  const pending = entries.filter((x) => !skip.has(x.id));
  await Promise.all(
    pending.map(async (entry) => {
      const key = `sources/${entry.id}/archive-${entry.review.textSha256}.txt`;
      const result = await cloudflare.request({
        method: 'PUT',
        path: `${base}/r2/buckets/sjn-ai-beta-sources/objects/${key}`,
        body: entry.text,
        contentType: 'text/plain; charset=utf-8',
        rawBody: true,
      });
      if (
        !result.success ||
        Number(result.result.size) !== new TextEncoder().encode(entry.text).length
      )
        throw new Error('R2 upload verification failed');
    }),
  );
  const staged = [],
    published = [];
  let passages = 0;
  for (const entry of pending) {
    const at = new Date().toISOString();
    const key = `sources/${entry.id}/archive-${entry.review.textSha256}.txt`;
    const source = {
      ...entry.metadata,
      review: entry.review,
      _id: entry.id,
      fileName: `${entry.review.archiveId}.txt`,
      approvalStatus: 'PROCESSING',
      createdAt: at,
      everPublished: false,
    };
    staged.push({
      sql: 'INSERT OR IGNORE INTO sources(id,title,status,authority,category,data,fileKey,createdAt) VALUES(?,?,?,?,?,?,?,?)',
      params: [
        entry.id,
        source.title,
        'PROCESSING',
        source.religiousAuthorityId,
        source.sourceCategory,
        JSON.stringify(source),
        key,
        at,
      ],
    });
    const chunks = [];
    for (let offset = 0; offset < entry.text.length; offset += 2160) {
      const originalText = entry.text.slice(offset, offset + 2400).trim();
      if (originalText.length < 30) continue;
      const chunk = {
        _id: uuid(await digest(`${entry.id}:${chunks.length}`)),
        chunkIndex: chunks.length,
        originalText,
        section: source.section,
        rulingNumber: '',
      };
      chunks.push(chunk);
    }
    if (!chunks.length || chunks.length > 500) throw new Error('Invalid passage count');
    passages += chunks.length;
    for (let i = 0; i < chunks.length; i += 20) {
      const part = chunks.slice(i, i + 20);
      staged.push({
        sql: `INSERT OR IGNORE INTO chunks(id,documentId,chunkIndex,data,searchText) VALUES ${part.map(() => '(?,?,?,?,?)').join(',')}`,
        params: part.flatMap((c) => [
          c._id,
          entry.id,
          c.chunkIndex,
          JSON.stringify(c),
          normalize(c.originalText),
        ]),
      });
    }
    staged.push({
      sql: 'INSERT OR REPLACE INTO chunk_search(rowid,searchText) SELECT rowid,searchText FROM chunks WHERE documentId=?',
      params: [entry.id],
    });
    source.approvalStatus = 'APPROVED';
    source.everPublished = true;
    source.reviewedAt = at;
    source.reviewedBy = 'cloudflare:authorized-source-import';
    published.push({
      sql: "UPDATE sources SET status='APPROVED',data=? WHERE id=? AND (SELECT count(*) FROM chunks WHERE documentId=?)=?",
      params: [JSON.stringify(source), entry.id, entry.id, chunks.length],
    });
    published.push({
      sql: 'INSERT INTO audit_logs(id,actorId,action,documentId,createdAt) VALUES(?,?,?,?,?)',
      params: [
        crypto.randomUUID(),
        source.reviewedBy,
        'reviewed-archive-import-and-approve',
        entry.id,
        at,
      ],
    });
    published.push({
      sql: 'INSERT INTO jobs(id,documentId,data,createdAt) VALUES(?,?,?,?)',
      params: [
        crypto.randomUUID(),
        entry.id,
        JSON.stringify({
          status: 'COMPLETED',
          method: 'authenticated-cloudflare-import',
          createdAt: at,
        }),
        at,
      ],
    });
  }
  if (staged.length) {
    await query(staged);
    await query(published);
  }
  return { imported: pending.length, skipped: skip.size, passages, ids: entries.map((x) => x.id) };
}
