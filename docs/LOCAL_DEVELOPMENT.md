# SJN · Knowledge with purpose

A polished, source-governed Islamic learning web application, version 0.1. Built as a pnpm workspace with React/TypeScript/Vite, Tailwind, shadcn-style Radix UI components, React Router, TanStack Query, Express, Better Auth, Mongoose, Zod and MongoDB.

**Local beta, not yet deployed.** Real accounts, onboarding, conversations and editorial workflows work locally. AI requires your provider credentials and authorized, reviewed source material. The normal database has no synthetic religious sources, mock answers or preconfigured admin passwords.

## Start locally

Requires Node.js **22.13+ (24 LTS recommended)**, internet for the initial dependency/MongoDB download, and pnpm 10.28.2.

```sh
npx --yes pnpm@10.28.2 install
npx --yes pnpm@10.28.2 dev
```

Open **http://localhost:5173/**. Use the same hostname throughout a session. API: `127.0.0.1:3001`. With no `MONGODB_URI`, the launcher starts a real, persistent MongoDB process on `127.0.0.1:27018`, keeping data in `.local/mongo-data`. It is a development convenience, not a production database. The first launch downloads a MongoDB binary. Local sessions survive normal restarts because the launcher stores a generated Better Auth secret in `.local/auth-secret`.

Create your own account, complete onboarding, and explore the workspace. No AI key is required for authentication, profile, history or source extraction/review. Chat displays a clear configuration error until AI is connected.

To use your own MongoDB or configure AI:

```sh
cp .env.example .env
```

Set `MONGODB_URI` to your MongoDB instance. To continue using the automatic local database, remove the `MONGODB_URI` line rather than leaving the sample URI pointing to an absent database. Set `BETTER_AUTH_SECRET` to a random secret (at least 32 characters); never use the sample value on a deployment. `.env` is ignored by version control.

## Login and Google sign-in

Login/signup now use **Better Auth** with MongoDB and Argon2id. Google buttons are available on both auth screens; existing users can explicitly connect Google from preferences. Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to `.env`, register `http://localhost:5173/api/auth/callback/google` in a Google OAuth Web application, then restart the app. Google remains unavailable until configured; email/password works locally without it.

See [authentication setup and migration](AUTHENTICATION.md) for the exact Google setup, existing-account migration, session behavior and live verification steps. Existing profiles, passwords, roles and conversation IDs are preserved on startup; old sessions require signing in again. Back up valuable data before upgrading.

## Configure AI

Set `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `LLM_MODEL`, and `EMBEDDING_MODEL` server-side. Defaults use the OpenAI-compatible Chat Completions and Embeddings protocols. The model must support JSON object output and `max_completion_tokens`. Set these to models available to your provider/account. Defaults are configurable examples, not a claim of the latest or cheapest model.

No provider key is exposed to Vite or browser JavaScript. Approved source passages and the question are sent to the chosen provider during inference; assess its retention/privacy terms before importing sensitive material. Generation errors never fall back to generic, ungrounded chat.

## Bootstrap an administrator

Run the app first so MongoDB is available. In a second terminal, use the controlled CLI. The CLI creates an admin, or explicitly promotes an existing account. It is never reachable through public registration.

For zsh on macOS:

```sh
read -s 'ADMIN_PASSWORD?Administrator password (12+ characters): '
export ADMIN_PASSWORD
npx --yes pnpm@10.28.2 admin:create
unset ADMIN_PASSWORD
```

Enter the email and adult age when prompted. The password is hidden during input and is not a command argument. Existing accounts retain their current password. If you use a separate database, set `MONGODB_URI` in `.env`. The CLI defaults to the automatic development database on port 27018. Sign in through `/login`; admins see **Source studio** after onboarding.

## Import and publish a source

1. Obtain permission to use a short, authoritative PDF/TXT/Markdown source or transcript. No automated scraping is performed.
2. Source studio → Import source. Enter exact title, scholar, category, authority, language, source URL, edition and version.
3. Use Fiqh only for `SISTANI` or `ALI_KHAMENEI`; educational topics use `JAWAD_NAQVI`.
4. Inspect every extracted passage and PDF page reference. Mixed/scanned PDFs and bad encodings are marked failed; provide a manually verified transcript instead.
5. With embeddings configured, check the review confirmation and choose **Approve & publish**. Only successful embedding and approval make it retrievable.
6. Ask a relevant question from a learner account with the matching Marja. Expand the returned reference to inspect its original text, URL, version, page and ruling/section.

No supplied website link grants copyright permission. Published content cannot be silently reprocessed or overwritten. Unpublish removes it from future retrieval; prior conversation citations remain historical snapshots. Upload corrections as new source versions and unpublish superseded versions.

## Useful commands

If pnpm is installed, use the short commands below. Otherwise prefix with `npx --yes pnpm@10.28.2` in place of `pnpm`.

```sh
pnpm dev             # MongoDB (when needed), API and Vite
pnpm lint
pnpm typecheck
pnpm test            # Vitest + Supertest + isolated real MongoDB
pnpm test:e2e        # Chrome desktop and mobile, isolated fixtures
pnpm build          # Static client, prerendered public landing, API compile
pnpm start          # API only; production also serves the built web client
```

E2E uses installed Google Chrome via Playwright, ports 5174/3002, and its own disposable database. It never adds synthetic fixtures to the normal app. To use Playwright's bundled Chromium instead, remove `channel: 'chrome'` in `playwright.config.ts` and run `pnpm exec playwright install chromium`.

Production start requires `NODE_ENV=production`, an HTTPS `APP_ORIGIN`, `BETTER_AUTH_SECRET`, a managed `MONGODB_URI`, and `pnpm build` first. Run behind an HTTPS reverse proxy. The current server binds to loopback and is intentionally local-first. This phase does not provision Cloudflare resources.

## Layout

```text
apps/web/src/          Public site, auth, onboarding, workspace, source studio
apps/web/src/components/ui/  Owned shadcn-style button and Radix dialog
apps/api/src/          Express routes, sessions, models, ingestion, errors
apps/api/src/rag/      Classification, authority policy, retrieval, providers,
                      generation, citation verification and orchestration
packages/shared/src/  Shared Zod contracts and REST types
scripts/              Persistent local launcher and controlled admin bootstrap
apps/api/tests/       Unit/integration tests and synthetic test-only providers
tests/e2e/           Browser journeys and isolated fixture server
docs/                Architecture, API, source governance and operations
```

## Scope and limits

This is a working local v0.1 foundation, not a claim of production certification. Live provider behavior and real religious-source quality need evaluation with your credentials and qualified reviewers. Routing is conservative keyword-based in three languages; ambiguous questions request clarification. Local cosine retrieval is capped at 5,000 candidate chunks per authority/topic; Atlas vector search is a future adapter. Delivery streams only after the complete answer's references are validated. Multi-instance job coordination, durable upload storage, distributed rate limits, email verification/recovery, OCR and independent scholar review are future deployment work.

See [architecture](ARCHITECTURE.md), [RAG](RAG_PIPELINE.md), [source governance](SOURCE_GOVERNANCE.md), [API](API.md), [testing](TESTING.md), [Cloudflare hosting](DEPLOYMENT.md), [SEO/AEO](SEO_AEO.md), and [roadmap](ROADMAP.md).
