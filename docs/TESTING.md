# Testing and verification

## Commands and isolation

`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e`.

The smoke check is `pnpm exec tsx scripts/smoke.ts` after building. It starts a temporary production-mode Express process and a separate disposable MongoDB, then verifies public prerendered HTML, private shells, static assets, CSP, authenticated boundaries, Better Auth Secure/HttpOnly/SameSite cookies and readiness.

Vitest runs unit tests and Supertest integration tests against an actual disposable MongoDB process. MongoDB download and loopback listening permissions are needed. No provider key is required. Test providers are defined only in `apps/api/tests/fixtures.ts`; production does not import or enable them. All test text is labeled **SYNTHETIC**, including mock answers, and is never valid religious guidance.

Playwright starts its own Vite/API servers on 5174/3002 and an isolated database. It runs Chrome at desktop 1440×1000 and mobile 390×844. The fixture administrator exists only in that disposable test server. The normal application at port 5173 is unaffected. Screenshots are written under `.local/screenshots`, failures/traces under `test-results`, and the HTML report under `playwright-report`.

## Coverage

The educational-only phase adds coverage for English/Urdu/Roman Urdu Fiqh deferral before retrieval or generation, mixed-topic Fiqh requests, generator-level scope enforcement, general educational search excluding Fiqh documents, and compatibility of stored Marja snapshots. Browser onboarding also resumes accounts saved at the former Marja step without requiring a selection. Current backend totals: **51 Vitest tests and 11 Worker runtime tests**. Existing low-level authority-isolation tests remain as regression checks for the preserved schema, not as enabled product functionality.

23 unit checks: multilingual conservative classification, preferred/explicit language selection, deceased-Marja referral routing, education/Fiqh authority separation, invalid/duplicate citations, no-evidence refusal without a model call, malicious-source policy boundaries, exact quote matching, text normalization, adult/profile validation, metadata-authority consistency, cosine dimensions, overlapping chunks, actual PDF page extraction and invalid binary files.

13 API integration checks: registration, login, logout, cookie flags, onboarding resume, protected endpoints, CSRF, adult restriction, admin enforcement, conversation ownership/rename/deletion, missing provider errors, source upload/extraction, embedding/approval/unpublishing, immutable published material, rejected/failed ingestion, both directions of Marja isolation, draft/irrelevant exclusion, malicious-source routing, idempotent answer replay, historical provenance after Marja changes, insufficient evidence and educational authority independence.

8 dedicated authentication checks: role injection, invalid passwords/origins, immediate all-session revocation, idempotent legacy migration preserving identity/password/history, migration conflicts, Google state/PKCE/token exchange, new/existing Google identity routing, adult onboarding, encrypted provider tokens, explicit account linking, untrusted callback rejection and cancelled consent. Google token/JWKS responses are simulated in the isolated test; Better Auth, its origin/CSRF checks, the database, sessions and callbacks run normally. No live Google credentials or network calls are used.

6 browser journeys: learner, administrator and authentication-screen flows on both desktop and mobile. Learner tests register, reload/resume onboarding, choose preferences, ask a fixture-backed question, inspect an actual citation, rename history, update profile, switch to Urdu, verify RTL/mobile navigation, change the password, sign out everywhere and sign back in. Admin tests log in, upload a synthetic file, inspect extracted text, publish and unpublish. Browser journeys check zero JavaScript page errors, viewport overflow and automated axe WCAG 2 A/AA violations on the landing page, Urdu workspace source studio, login and signup. Authentication-screen tests verify the unconfigured Google state and safe cancelled-consent message.

## Recorded local results

The learning-room redesign also exercises desktop sidebar collapse/expand, recent-history filtering and empty results, starter-question insertion/focus, follow-up focus, a composer visible in the initial viewport, and mobile drawer dismissal. Automated axe checks include the English welcome, answered chat and open mobile drawer. The six journeys pass with the redesigned desktop/mobile layouts, including Urdu RTL, source inspection and account settings. Public previews are regenerated only from these synthetic fixtures.

- Unit + integration: **44 passed**.
- Playwright: **6 passed** (desktop and mobile learner/admin/auth journeys).
- TypeScript: **passed** with strict mode.
- ESLint: **passed** after fixes.
- Production build: **passed**, including public-page prerendering and API compilation.
- Production HTTP smoke: **passed**.
- Runtime dependency audit: **no known vulnerabilities found** by `pnpm audit --prod` at verification time.

The initial sandbox denied localhost sockets, so database/browser checks were rerun with local process/network permissions. An early integration-test cookie-transfer bug and contrast violations were fixed before recording the passing results. Tests do not rely on assertions being skipped or accessibility rules being disabled.

## Not verified without external setup

Live Google consent/sign-in with your OAuth client (see [setup](AUTHENTICATION.md)), multilingual religious answer quality over authentic approved material, scholar acceptance, managed database backup recovery and production load are not established by these tests. Google credentials and approved Marja-specific Fiqh sources remain configuration dependencies; the hosted educational corpus is documented in SOURCE_INDEXING.md. The separate Cloudflare deployment and neutral Workers AI smoke test are described below. Browser emulation is not a physical iPhone/Android compatibility certification. Automated accessibility checks supplement, rather than replace, assistive-technology review.

To verify live RAG: configure a provider/model in `.env`, bootstrap a reviewer, import an authorized short source with accurate metadata, inspect every passage, approve it (real embeddings are generated), ask a relevant question under the matching Marja, then inspect the returned original text and provenance. Repeat with the opposite Marja and an unsupported question to verify abstention. Have a qualified scholar assess semantic faithfulness; a valid citation alone does not certify an answer.

## Cloudflare beta verification (2026-10-23)

`pnpm test:worker` builds and executes the hosted backend in workerd with disposable D1 and R2. Twelve integration tests cover health/security headers, origin and adult checks, signup/onboarding/role injection, cross-user isolation, no-evidence answers and retry idempotency, conversation leases, private upload/review/rejection, approval/retrieval/unpublishing, PDF page attribution and session revocation, plus a 601-passage corpus, bounded embedding caches, safe FTS query syntax, archive hash validation and retry deduplication, plus a simulated D1 daily-limit failure that must return 503 with a bounded Retry-After header and no provider details. A separate AI fixture Worker is used only in tests and is never part of the deployed bundle.

The live deployment was checked in Chrome for administrator login, learner signup, profile persistence, no-source chat, conversation reload, role restrictions and desktop/mobile rendering. The Workers AI generation model returned a valid neutral JSON response and the embedding model returned a 1,024-dimension vector through the authenticated Cloudflare API. Live password change, new-password login, Secure/HttpOnly cookie flags and mobile axe accessibility also passed. The deployed `/api/ready` reports a working D1 binding and configured AI. No test material was published to the hosted knowledge base; disposable learner records are removed after verification.

Cloudflare build output passes `cf deploy --prebuilt --mode production --dry-run`. All 44 MongoDB tests and six desktop/mobile journeys continue to pass, including password changes. For account identifiers, deployment commands and remaining launch dependencies, see [deployment](DEPLOYMENT.md).

## Reviewed source import

`node --test scripts/sources/*.test.mjs` checks that connector imports preserve original files, publish only after successful indexing, and reject changed archive content before remote writes. These tests run in CI alongside the Worker integration suite and extraction tests.

`node scripts/sources/verify_live_index.mjs` exercises real Workers AI with a disposable learner: Urdu, English and Roman Urdu educational questions, plus a Fiqh question without approved Marja evidence. It saves exact answers and citation snapshots to the ignored indexing directory. Remove only the generated test learner by its recorded ID after verification; preserve the owner’s account. See [corpus review and indexing](SOURCE_INDEXING.md) for scope and limitations.

The completed corpus was checked on 2026-10-24 (Asia/Karachi): all four live scenarios passed, including the insufficient-source Fiqh case. Fifteen citations were compared to stored passage hashes and provenance. Worker tests: 11 passed; import/search tests: 7 passed; extraction tests: 10 passed. TypeScript, ESLint and repository checks passed. These are functional and integrity checks, not scholarly certification.

The redesigned educational-only release was verified live on 2026-10-28 (Asia/Karachi), after the earlier D1 daily write allowance block cleared. Signup, onboarding, login, Urdu/English/Roman Urdu grounded answers, paused Fiqh guidance, hidden Marja preferences, desktop/mobile navigation and learner access restrictions passed. All 15 returned citations matched approved stored passages exactly. The deployed Worker and frontend hashes matched the local build; all 12 Worker tests and GitHub CI passed. The disposable learner was removed, leaving 1,331 approved sources and 31,331 passages intact. Google OAuth remains disabled pending credentials.

## Question-handling regression verification (2026-10-29)

The [question-handling audit](QUESTION_HANDLING_AUDIT.md) records the historical deterministic clarification bug, corpus checks and measured retrieval changes. Final results: 69 API tests, 13 Worker integration tests, 8 source import/search tests and 10 extraction tests passed, along with type checking, lint, repository checks, production builds and deployment dry-run. Seven authenticated live cases passed on Worker version `8584609f-0888-4972-9850-88896221b312`; all 16 citations matched approved stored passages and metadata exactly. The disposable learner was removed. No source documents were changed.

Run `node scripts/sources/verify_question_pipeline.mjs after` for the live check. It creates a disposable learner and saves credentials plus response snapshots under ignored `.local/question-audit/`. Remove only that generated learner by its recorded ID and remove its credentials file after verification. The script checks expected modes, the relevant article, terminology acknowledgement, Roman Urdu script and citation authority; source-text integrity was separately checked against D1. Real-model checks are samples, not a guarantee of semantic entailment or scholarly accuracy.
