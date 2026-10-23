# Source governance

## Authority and ownership

Fiqh authority IDs are immutable: SISTANI and ALI_KHAMENEI. Education uses JAWAD_NAQVI. The schema prevents Fiqh sources being assigned to the educational scholar, and prevents educational documents being given Fiqh topics. Metadata distinguishes source authority from subject category.

Ayatollah Sayyid Ali Khamenei is labeled deceased (2026), consistent with the reference. The application never determines whether a person may initiate or continue his Taqlid. Such questions require qualified guidance. Background verification: [AP report](https://apnews.com/article/c2f11247d8a66e36929266f2c557a54c).

The following are provenance starting points, not copyright licenses or existing imported data:

- [Sistani office: Rules of Worship](https://www.sistani.org/english/book/26890/)
- [Ali Khamenei: Practical Laws](https://www.leader.ir/en/book/32/Practical-Laws-of-Islam)
- [Syed Jawad Naqvi books and lectures](https://www.syedjawadnaqvi.com/)

No site is scraped automatically. A reviewer must establish the original publisher, attribution, edition, usage rights, extraction fidelity and applicability. The initial database is empty.

## Lifecycle

DRAFT → PROCESSING → READY_FOR_REVIEW → PROCESSING (embedding) → APPROVED.

Extraction failures lead to FAILED; a never-published document can be reprocessed. Rejection leads to REJECTED. Unpublishing APPROVED material returns it to READY_FOR_REVIEW, preserving its immutable original text, embeddings and version. Republishing that unchanged version is allowed with compatible embeddings. Once everPublished=true, reprocessing is prohibited even after unpublication/rejection. Corrections are new imports with a new version; unpublish obsolete versions explicitly.

The review UI displays exact extracted passages, page numbers, author, authority, source URL and publication data. Admin actions are audited. In v0.1 the same admin may upload and approve; independent two-person scholarly approval is not yet enforced. A checkbox is an attestation of human review, not an automated authenticity certificate.

## Upload handling

8 MB file limit, 150-page PDF limit, 1,000-chunk import limit. Files are held in a bounded upload buffer and written with UUID names under UPLOAD_DIR. PDF magic bytes are checked before extraction. TXT/MD require valid UTF-8 without NUL bytes. Text remains inert data, not executable HTML.

Any PDF page with fewer than 20 extracted characters, or suspicious replacement characters, causes review failure. This conservative check may reject legitimate sparse title pages: remove them in a prepared authorized extract or provide a verified transcript. No OCR output is invented. Actual extracted page numbers are preserved. Uploaded files are not accessible from a public static route.

## Historical answers

Each answer stores citation snapshots including exact source text, document/chunk IDs, version, URL and authority. Unpublication prevents future retrieval but does not rewrite past answers. Historical references are labeled by version and represent the source at answer time, not a claim that the source is still published. Source deletion and user-account deletion policies require a separate production retention design.
