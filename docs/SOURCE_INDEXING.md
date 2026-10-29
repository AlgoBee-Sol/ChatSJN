# Reviewed SJN corpus and hosted search

The owner requested review and indexing of the extracted `syedjawadnaqvi.com` archive for the live chatbot. This is an **automated technical review with sampled text inspection**, not scholarly certification of every assertion or an independently verified copyright license.

## Review decisions

| Decision                                          | Documents |
| ------------------------------------------------- | --------: |
| Archived website texts                            |     1,466 |
| Eligible distinct texts                           |     1,331 |
| Exact duplicate texts excluded                    |       126 |
| Publisher forewords / tables of contents excluded |         9 |

Every eligible file passed its SHA-256 and character-count checks, published-source URL checks, and extraction-quality checks. Topics are assigned by Urdu keyword matching. All imports are **EDUCATIONAL / JAWAD_NAQVI**. They cannot supply Marja-specific Fiqh answers. Collection-level author credits are preserved; where the archive lacks an author credit, attribution says “Syed Jawad Naqvi’s website” rather than inventing an individual byline. Historical and current-affairs material represents the publication’s context.

The archive contained no discoverable PDF files. Recording links remain a catalog; they are not transcripts and are not searchable answer evidence.

## Verified live index (2026-10-24, Asia/Karachi)

- **1,331 approved source documents; 31,331 searchable passages.**
- **1,331 private R2 originals**, totaling 117,877,548 bytes. Every stored object's size and MD5 ETag matched its local original; source SHA-256 values and per-document passage counts matched the reviewed manifest.
- D1 full-text integrity check passed with no mismatches. Database size at verification: 316,780,544 bytes (about 302 MiB).
- Live example checks passed in Urdu, English and Roman Urdu. All 15 returned citations (12 distinct passages) matched the stored text, document IDs, source URLs and current approval state. A Fiqh question correctly returned insufficient evidence. The disposable test account and its related records were removed.
- Import completed without failed batches. All 126 duplicate texts and 9 publisher-only front-matter entries remain excluded from answer retrieval.

Machine-readable review, import checkpoints and verification results are under `.local/sources/syedjawadnaqvi/indexing/`. The originals remain private; only retrieved citation passages are returned by the chatbot.

## Reproduce or resume

```sh
python3 scripts/sources/review_archive.py
# With current administrator credentials in the ignored local credentials file:
node scripts/sources/index_archive.mjs
```

The review writes `.local/sources/syedjawadnaqvi/indexing/manifest.jsonl` and `review.json`. It does not alter the original archive. The API importer verifies hashes again and uses stable source IDs to make retries safe. It preserves explicit rejections/unpublication. Checkpoints and result reports stay in the ignored indexing directory; never commit the archive, credentials or database backups.

If the saved temporary admin password has been changed, the already-authorized Cloudflare connector can run `importReviewedBatch` from `scripts/sources/cloudflare-import.mjs`. Feed it compressed, hash-checked batches from `prepare_cloudflare_import.mjs OFFSET COUNT` (at most 10). It writes originals to private R2, stages D1 passages, builds full-text entries, and publishes only after successful index writes. This uses account authorization, does not change passwords, and records the audit actor as `cloudflare:authorized-source-import`. Do not expose it as an unauthenticated HTTP endpoint. Skip already-approved IDs on resume; do not override deliberate unpublication.

Every imported source records the review method, archive ID, text hash, attribution limitations, version, source URL and authorization basis. `rightsConfirmed` records the operator’s authorization to use the selected source; the review metadata explicitly says a copyright license was not independently verified. A qualified reviewer can inspect or unpublish any source in Source studio.

## Retrieval

Migration `0003_source_search.sql` adds `chunks.searchText` and an external-content FTS5 table. Search normalization changes only the index copy, preserving exact original text in citation snapshots. Approved status, authority, category and topic filters apply before candidate selection. At most 12 candidates per attempt are embedded/reranked, with model-specific caching; at most five become answer evidence. An educational topic miss retries once across approved educational topics, retaining the same authority/category restrictions and 0.45 threshold. Common English/Roman Urdu concepts use a controlled Urdu search vocabulary (for example honesty/sachai → سچائی, patience/sabr → صبر, Iran/revolution/theories → ایران/انقلاب/نظریات). Other Latin-script queries receive bounded model-generated Urdu keywords. This fallback is less reliable and may require rephrasing the question in Urdu. No whole-corpus embedding pass is required.

This design removes the former 500-passage total limit. It retains a 500-passage per-document extraction limit and bounded model input. Lexical-first retrieval can miss paraphrases and synonyms. An insufficient-evidence answer is preferable to inventing support. Model-generated citation IDs and quotes are validated, and publication is rechecked before answers are saved. These checks establish citation consistency, not theological correctness or complete semantic entailment.

## Backup and account migration

A private pre-migration backup is stored at `.local/cloudflare/pre-source-index.sql`. It predates the imported corpus.

D1 currently does not export databases containing virtual tables. At a planned maintenance window, pause writes and search, drop **only** the derived `chunk_search` table, export D1, then recreate and rebuild it on both the original and restored database. Keep `chunks` (including `searchText`), `sources`, originals and citation history. Never rerun the `ALTER TABLE` from migration 0003 on a restored database. [Cloudflare’s documented export limitation](https://developers.cloudflare.com/d1/best-practices/import-export-data/#known-limitations).

```sql
CREATE VIRTUAL TABLE chunk_search USING fts5(searchText,
  content='chunks', content_rowid='rowid',
  tokenize='unicode61 remove_diacritics 0');
INSERT INTO chunk_search(chunk_search) VALUES('rebuild');
```

The source index is derived and reproducible. Original private R2 objects and the authoritative D1 tables must still be copied and verified when moving Cloudflare accounts.
