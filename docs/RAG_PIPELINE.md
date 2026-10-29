# Grounded-answer pipeline

1. Authenticate, verify completed onboarding, validate length/request UUID, rate-limit, check conversation ownership and acquire its lease.
2. For requests requiring AI in the local backend, require configured providers. Missing keys produce `503 AI_NOT_CONFIGURED`; no mock or generic fallback exists in production code.
3. `QuestionClassifier` normalizes search text and conservatively categorizes English, Urdu and common Roman Urdu terms. Explicit language requests override profile preference. An unrecognized topic is `OTHER` and still searches approved educational sources. Only narrowly recognized requests without a subject (for example “What about it?”) ask for clarification. Fiqh is currently disabled: deterministic policy checks return guidance before retrieval or generation.
4. `SourceAuthorityResolver` constructs a server-owned filter. Fiqh: APPROVED + FIQH + user's Marja + FIQH topic. Education: APPROVED + EDUCATIONAL + JAWAD_NAQVI, initially narrowed by a recognized topic. A topic-filtered search with no qualifying evidence retries once across educational topics; approval, authority and source category remain mandatory. `OTHER` searches across eligible educational topics immediately. User instructions and source contents cannot modify these hard restrictions.
5. The hosted Worker uses normalized FTS5/BM25 to select up to 12 candidates per search attempt, then BGE-M3 cosine ranking (minimum 0.45) selects up to five passages. Original text is preserved, with embeddings cached by model. Controlled Urdu aliases cover common English/Roman Urdu concepts, including Iran/revolution/theories; Urdu نظریات also expands to نظریہ. Optional keyword translation failures fall back to original-language search. The local MongoDB `KnowledgeRetriever` selects eligible documents first, then only their matching-model chunks. It embeds the question, computes cosine similarity, applies `RAG_MIN_SCORE` (default 0.45) and returns up to five passages. Dimension mismatches never match. The score is a configurable relevance heuristic, not calibrated confidence.
6. `AnswerGenerator` receives source records as untrusted JSON data under a separate policy instruction. Only evidence-supported claims are allowed. Prior user questions provide limited context; past assistant answers are not treated as evidence. Requests with an unresolved reference may need explicit restatement. Conflicting passages must remain attributed; retrieval rank cannot establish scholarly preference. Material differences between question wording and source wording must be stated rather than silently equated.
7. JSON output must satisfy a Zod schema. `CitationValidator` rejects absent, duplicate or unknown chunk references. Requested quotes must exactly occur in a cited source. Generated URLs and numeric citation markers are rejected; citation cards are created server-side from stored metadata.
8. A final approval-state check rejects a source unpublished during generation. Persist language, classification, Marja snapshot, source metadata and original text with the answer.
9. Deliver SSE `delta` and `done` events only after validation. This intentionally buffers model generation: it provides incremental browser delivery without exposing unverified model tokens. It is not low-latency provider-token streaming.

## Providers

`EmbeddingProvider` has a model identity and batch embed method; `LLMProvider` exposes policy/data generation. OpenAI-compatible implementations use a server-side bearer key, 60-second timeouts and safe user-facing provider errors. External response shapes are validated. Dependencies can be injected only by server composition; there is no HTTP flag or application environment switch to enable test mocks.

In the local MongoDB variant, embeddings are generated in batches of 20 during approval. Extraction and review work without AI credentials. A failed embedding attempt returns the document to READY_FOR_REVIEW, where it is ineligible for retrieval. Scoring requires the same `EMBEDDING_MODEL` used to index the source. Local vectors are stored in MongoDB; a future Atlas adapter must preserve the authority/status constraints in both query and final validation.

## Text and provenance

The local variant uses 1,600-character chunks with 200-character overlap. The hosted Worker uses 2,400 characters with 240-character overlap. PDF pages are chunked independently; source boundaries and page numbers never span pages. Original text stays unchanged; NFKC, diacritic removal, whitespace folding and Arabic/Persian letter normalization apply only to separate search text. Section/ruling metadata is manually supplied, not guessed from document text. For multi-ruling documents, import a separately identified passage or add a reviewed section-aware extractor in v0.2.

## What verification does and does not prove

Source filtering and citation identity are deterministic, tested guarantees for these code paths. A citation ID proves provenance, not semantic entailment of every generated sentence. Prompt instructions and output validation reduce injection and hallucination risks; they do not mathematically guarantee an arbitrary provider's theological accuracy. Qualified source review, bilingual religious evaluations, adversarial tests against the real model and a human feedback workflow remain necessary before a public launch. Current injection tests prove routing isolation and invalid-reference rejection, not universal LLM prompt-injection immunity.

A small curated library and conservative refusal are preferable to unreviewed coverage. Never lower the threshold merely to force an answer. Test actual Urdu/Roman Urdu retrieval with an approved evaluation set before tuning it.

## Question-handling regression

See [the 29 October 2026 investigation](QUESTION_HANDLING_AUDIT.md) for the historical clarification root cause, source integrity checks, measured multilingual retrieval changes and live verification. No corpus migration or similarity-threshold reduction was required.
