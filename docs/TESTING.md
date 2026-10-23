# Testing and verification

## Commands and isolation

`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e`.

The smoke check is `pnpm exec tsx scripts/smoke.ts` after building. It starts a temporary production-mode Express process and a separate disposable MongoDB, then verifies public prerendered HTML, private shells, static assets, CSP, authenticated boundaries, Better Auth Secure/HttpOnly/SameSite cookies and readiness.

Vitest runs unit tests and Supertest integration tests against an actual disposable MongoDB process. MongoDB download and loopback listening permissions are needed. No provider key is required. Test providers are defined only in `apps/api/tests/fixtures.ts`; production does not import or enable them. All test text is labeled **SYNTHETIC**, including mock answers, and is never valid religious guidance.

Playwright starts its own Vite/API servers on 5174/3002 and an isolated database. It runs Chrome at desktop 1440×1000 and mobile 390×844. The fixture administrator exists only in that disposable test server. The normal application at port 5173 is unaffected. Screenshots are written under `.local/screenshots`, failures/traces under `test-results`, and the HTML report under `playwright-report`.

## Coverage

23 unit checks: multilingual conservative classification, preferred/explicit language selection, deceased-Marja referral routing, education/Fiqh authority separation, invalid/duplicate citations, no-evidence refusal without a model call, malicious-source policy boundaries, exact quote matching, text normalization, adult/profile validation, metadata-authority consistency, cosine dimensions, overlapping chunks, actual PDF page extraction and invalid binary files.

13 API integration checks: registration, login, logout, cookie flags, onboarding resume, protected endpoints, CSRF, adult restriction, admin enforcement, conversation ownership/rename/deletion, missing provider errors, source upload/extraction, embedding/approval/unpublishing, immutable published material, rejected/failed ingestion, both directions of Marja isolation, draft/irrelevant exclusion, malicious-source routing, idempotent answer replay, historical provenance after Marja changes, insufficient evidence and educational authority independence.

8 dedicated authentication checks: role injection, invalid passwords/origins, immediate all-session revocation, idempotent legacy migration preserving identity/password/history, migration conflicts, Google state/PKCE/token exchange, new/existing Google identity routing, adult onboarding, encrypted provider tokens, explicit account linking, untrusted callback rejection and cancelled consent. Google token/JWKS responses are simulated in the isolated test; Better Auth, its origin/CSRF checks, the database, sessions and callbacks run normally. No live Google credentials or network calls are used.

6 browser journeys: learner, administrator and authentication-screen flows on both desktop and mobile. Learner tests register, reload/resume onboarding, choose preferences, ask a fixture-backed question, inspect an actual citation, rename history, update profile, switch to Urdu, verify RTL/mobile navigation, sign out everywhere and sign back in. Admin tests log in, upload a synthetic file, inspect extracted text, publish and unpublish. Browser journeys check zero JavaScript page errors, viewport overflow and automated axe WCAG 2 A/AA violations on the landing page, Urdu workspace source studio, login and signup. Authentication-screen tests verify the unconfigured Google state and safe cancelled-consent message.

## Recorded local results

- Unit + integration: **44 passed**.
- Playwright: **6 passed** (desktop and mobile learner/admin/auth journeys).
- TypeScript: **passed** with strict mode.
- ESLint: **passed** after fixes.
- Production build: **passed**, including public-page prerendering and API compilation.
- Production HTTP smoke: **passed**.
- Runtime dependency audit: **no known vulnerabilities found** by `pnpm audit --prod` at verification time.

The initial sandbox denied localhost sockets, so database/browser checks were rerun with local process/network permissions. An early integration-test cookie-transfer bug and contrast violations were fixed before recording the passing results. Tests do not rely on assertions being skipped or accessibility rules being disabled.

## Not verified without external setup

Live Google consent/sign-in with your OAuth client (see [setup](AUTHENTICATION.md)), actual paid-provider inference/embeddings, multilingual religious answer quality over authentic approved material, scholar acceptance, Cloudflare deployment, managed database backup recovery, multi-instance behavior and production load are not established by these tests. No real API key was supplied; this is a configuration dependency, not a test failure. Browser emulation is not a physical iPhone/Android compatibility certification. Automated accessibility checks supplement, rather than replace, assistive-technology review.

To verify live RAG: configure a provider/model in `.env`, bootstrap a reviewer, import an authorized short source with accurate metadata, inspect every passage, approve it (real embeddings are generated), ask a relevant question under the matching Marja, then inspect the returned original text and provenance. Repeat with the opposite Marja and an unsupported question to verify abstention. Have a qualified scholar assess semantic faithfulness; a valid citation alone does not certify an answer.
