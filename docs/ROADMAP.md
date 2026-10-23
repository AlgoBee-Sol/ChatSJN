# Roadmap

## v0.1 delivered scope

Local web app, Better Auth email/password sessions and Google OAuth/account linking (Google credentials required), adult onboarding, two Marja choices, three answer languages, conversation persistence, admin-only source ingestion/review, real embedding and grounded-generation adapters, local MongoDB cosine retrieval, validated citations and automated regression tests. No live sources are preloaded.

## v0.2 priorities

1. Build a qualified-scholar-reviewed evaluation set in Urdu, English and Roman Urdu. Measure routing, retrieval, refusal, citation precision and semantic faithfulness with the actual provider.
2. Improve Roman Urdu normalization and conservative mixed-topic/follow-up routing. Add reviewed section/ruling-level extraction.
3. Add independent reviewer approval, change diffs, correction notices for historical citations and source expiration/review reminders.
4. Implement OCR as a clearly marked adapter with mandatory manual review. Retain original pages and OCR confidence metadata.
5. Add answer feedback and a triage workflow, without automatically treating user feedback as religious truth.
6. Add Atlas vector retrieval when the curated corpus exceeds local adapter limits; preserve deterministic source isolation.
7. Harden hosted operations: R2 uploads, managed MongoDB, shared rate limits, durable jobs, monitoring, backup verification, privacy/retention tools, email verification and recovery.

## v0.3

Android and iOS clients using shared REST contracts; explicitly designed native authentication, consent and app-store privacy flows. No backend replacement is necessary solely to add a mobile UI.

Payments, social networking, voice, live transcription, fine-tuning and autonomous web scraping remain outside the current scope.
