# Source governance

**Current product scope:** Fiqh and Marja selection are paused. Only approved educational sources are used for new educational answers; historical records remain intact. The authority model below is retained for provenance and a future reviewed Fiqh release. See [educational scope](EDUCATIONAL_SCOPE.md).

## Authority and ownership

Fiqh authority IDs are immutable: SISTANI and ALI_KHAMENEI. Education uses JAWAD_NAQVI. The schema prevents Fiqh sources being assigned to the educational scholar, and prevents educational documents being given Fiqh topics. Metadata distinguishes source authority from subject category.

Ayatollah Sayyid Ali Khamenei is labeled deceased (2026), consistent with the reference. The application never determines whether a person may initiate or continue his Taqlid. Such questions require qualified guidance. Background verification: [AP report](https://apnews.com/article/c2f11247d8a66e36929266f2c557a54c).

The following identify source publishers; a link alone does not grant a copyright license. The imported SJN corpus is documented below:

- [Sistani office: Rules of Worship](https://www.sistani.org/english/book/26890/)
- [Ali Khamenei: Practical Laws](https://www.leader.ir/en/book/32/Practical-Laws-of-Islam)
- [Syed Jawad Naqvi books and lectures](https://www.syedjawadnaqvi.com/)

No site is scraped on application startup or on a schedule. The explicitly requested [local SJN extraction workflow](SOURCE_EXTRACTION.md) creates an unreviewed archive of public website text, linked PDFs, and recording URLs. It does not publish sources to the application. A reviewer must establish the original publisher, attribution, edition, usage rights, extraction fidelity and applicability before approval. The hosted database contains the operator-authorized SJN corpus described in [source indexing](SOURCE_INDEXING.md); the local MongoDB database is separate.

## Lifecycle

Local MongoDB: DRAFT → PROCESSING → READY_FOR_REVIEW → PROCESSING (embedding) → APPROVED.

Hosted D1: PROCESSING → READY_FOR_REVIEW → APPROVED. Extraction atomically creates passages and the full-text index; approval checks index readiness. Embeddings are computed only for search candidates.

Extraction failures lead to FAILED; a never-published document can be reprocessed. Rejection leads to REJECTED. Unpublishing APPROVED material returns it to READY_FOR_REVIEW, preserving its immutable original text, embeddings and version. Republishing that unchanged version is allowed with compatible embeddings. Once everPublished=true, reprocessing is prohibited even after unpublication/rejection. Corrections are new imports with a new version; unpublish obsolete versions explicitly.

The review UI displays exact extracted passages, page numbers, author, authority, source URL and publication data. Admin actions are audited. In v0.1 the same admin may upload and approve; independent two-person scholarly approval is not yet enforced. The manual UI checkbox records the administrator’s review attestation. The operator-authorized archive import instead records `review.method=automated-provenance-and-quality-review`, file hashes, attribution limits and the source-use authorization basis. It does not attest human scholarly review or an independently verified copyright license.

## Upload handling

Local importer: 8 MB file limit, 150-page PDF limit, 1,000-chunk import limit. Hosted importer: the same file/page limits, with 500 passages per document. Files are held in a bounded upload buffer and written with UUID names under UPLOAD_DIR. PDF magic bytes are checked before extraction. TXT/MD require valid UTF-8 without NUL bytes. Text remains inert data, not executable HTML.

Any PDF page with fewer than 20 extracted characters, or suspicious replacement characters, causes review failure. This conservative check may reject legitimate sparse title pages: remove them in a prepared authorized extract or provide a verified transcript. No OCR output is invented. Actual extracted page numbers are preserved. Uploaded files are not accessible from a public static route.

## Historical answers

Each answer stores citation snapshots including exact source text, document/chunk IDs, version, URL and authority. Unpublication prevents future retrieval but does not rewrite past answers. Historical references are labeled by version and represent the source at answer time, not a claim that the source is still published. Source deletion and user-account deletion policies require a separate production retention design.
