# Cloudflare deployment and migration

The hosted beta runs entirely on Cloudflare. The local Express/MongoDB app remains available through `pnpm dev`; its data has not been moved or deleted.

## Current deployment

| Resource                | Value                                                  |
| ----------------------- | ------------------------------------------------------ |
| Site                    | https://sjn-ai-beta.algobee-solutions.workers.dev      |
| Account                 | Algobee.solutions@gmail.com's Account                  |
| Account ID              | `70f8868a0c41eedd3481da031af7d6cd`                     |
| Worker                  | `sjn-ai-beta`                                          |
| D1 database             | `sjn-ai-beta` / `b679fbdb-2e8f-477e-8ee5-7b8e5642a0c1` |
| Private R2 bucket       | `sjn-ai-beta-sources`                                  |
| Generation              | `@cf/meta/llama-3.3-70b-instruct-fp8-fast`             |
| Multilingual embeddings | `@cf/baai/bge-m3`                                      |
| Scheduled cleanup       | Daily at 03:17 UTC                                     |

These resources belong only to SJN AI. Other applications in the account are unchanged. Account/resource identifiers are configuration, not credentials. Secrets and administrator bootstrap files live only in ignored `.local/cloudflare/` files, with owner-only permissions; the runtime auth secret is a Worker secret.

## Behavior and scope

The current release uses the redesigned learning room and [educational-only scope](EDUCATIONAL_SCOPE.md). Marja selection is hidden, onboarding has three visible steps, and recognized Fiqh requests receive guidance without retrieval or generation. General educational questions search only approved educational sources. This release changes no database schema, stored preferences or source records; no migration or re-import is needed.

Email/password registration, sessions, adult onboarding, preferences, conversation history and administrator source review use D1. Better Auth uses its portable default password hashing for hosted accounts; the local MongoDB version retains Argon2id. They are separate account databases. Original uploads use private R2; PDF extraction runs through `unpdf` in Workers. The shared classifier, authority rules and citation validator serve both backends.

Google is deliberately disabled until the owner supplies OAuth credentials. The operator-authorized SJN website corpus is now managed through the [reviewed source-indexing workflow](SOURCE_INDEXING.md). Without approved evidence, the app returns an explicit insufficient-source message instead of generating a religious answer. The administrator account must complete its own onboarding. Its temporary login is recorded in `.local/cloudflare/admin-credentials.json`; change the password in **Your preferences → Change password** after first login. This file is not part of the repository.

The temporary site sends `noindex, nofollow`, and `robots.txt` disallows crawling. Logs and sampled traces are enabled; application errors omit passwords, question text, source bodies and tokens. Request query strings are redacted in platform telemetry.

## Build, test and redeploy

Requires Node.js **22.18+**, pnpm **10.28.2**, and the pinned `cf` CLI. The initial deployment used the authorized Cloudflare connector. A terminal/CI deployment requires its own `cf auth login` or scoped `CLOUDFLARE_API_TOKEN`; connector credentials are not exported.

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm test:worker
pnpm check:cloudflare

# Sign in to the intended account, then deploy the reviewed build:
pnpm exec cf auth login
pnpm exec cf deploy --prebuilt --mode production
```

`pnpm build:cloudflare` builds/prerenders React, bundles the Worker, and creates validated `.cloudflare/output/v0/` artifacts using pinned Cloudflare build-output helpers. `pnpm check:cloudflare` also performs a no-upload CLI dry run. `pnpm deploy:cloudflare` rebuilds and deploys. Build output and source maps are ignored by Git; source maps are Worker deployment modules, not public web assets.

Configuration and inferred binding types come from `cloudflare.config.ts`. Do not run plain `cf build` for this custom monorepo build: use the package script and `cf deploy --prebuilt --mode production`. Do not create a parallel Wrangler configuration.

Apply new, reviewed migrations before deploying code that requires them:

```sh
pnpm exec cf d1 migrations apply b679fbdb-2e8f-477e-8ee5-7b8e5642a0c1 --dir apps/worker/migrations
```

`0001_auth.sql` was generated from Better Auth 1.7.12. Applied migrations are recorded in `d1_migrations`. Never edit an applied migration; add a new numbered SQL file. The schema generator is for reviewing future auth changes against a disposable database, not overwriting a production migration.

For secrets, use an ignored JSON file and the CLI's secret-file option, never command-line secret values:

```sh
pnpm exec cf deploy --prebuilt --mode production --secrets-file .local/cloudflare/secrets.json
```

Keep the production `BETTER_AUTH_SECRET` stable and backed up privately. Never replace it with a local development secret. Subsequent builds retain existing secrets unless explicitly replaced.

## Enable Google later

1. Create a Google OAuth **Web application** client and configure its consent screen/testing audience.
2. Add the authorized origin `https://sjn-ai-beta.algobee-solutions.workers.dev` and exact callback `https://sjn-ai-beta.algobee-solutions.workers.dev/api/auth/callback/google`.
3. Set the public `googleClientId` constant in `cloudflare.config.ts`; this enables the `GOOGLE_CLIENT_ID` binding and makes `GOOGLE_CLIENT_SECRET` a required secret. Add `GOOGLE_CLIENT_SECRET` to the ignored secret file, keeping the existing auth secret.
4. Build and deploy with the secret-file option above. Check `/api/auth/config`, then test login, cancellation and explicit linking from an existing password account.

No implicit account merging is enabled. OAuth users must complete adult onboarding before chatting. Transactional email verification and email-based password recovery are not configured; password changes require the current password. Add a mail provider before promising email recovery.

## Source ingestion and operating limits

Upload only approved-for-use originals through Source studio, inspect extracted passages and metadata, then publish. Uploads are limited to 8 MB and 150 PDF pages. Scanned PDFs require OCR before upload. The hosted importer supports 500 passages per document (2,400 characters with 240-character overlap). Migration `0003_source_search.sql` adds a D1 FTS5 index. Search applies approved status, authority, category and topic filters before selecting at most 12 full-text candidates. Workers AI reranks only those candidates; vectors are cached with their model ID. The former 500-passage total-corpus limit is removed. Common English/Roman Urdu concepts use deterministic Urdu search aliases; unfamiliar Latin-script queries use bounded model keyword expansion. Lexical retrieval can still miss synonyms; evaluate recall before broad public release.

Generation uses at most 1,800 output tokens per request. D1 enforces 15 chat attempts/minute/user and a shared 200-attempt daily beta ceiling; retries returning an existing answer do not consume another attempt. These are application controls, not a billing guarantee. Workers, D1, R2 and Workers AI use the connected account's plan and quotas. No paid plan upgrade was performed. Review usage in the dashboard before opening registration to a broad audience.

D1 free-tier daily row limits reset at midnight UTC (05:00 Pakistan time). A bulk source import can consume the same allowance used by authentication and chat. When a daily-limit error reaches the Worker, the API returns `503 TEMPORARILY_UNAVAILABLE` with a `Retry-After` header pointing to the reset; provider details are kept out of the response. A successful read-only `/api/ready` probe does not establish write availability. Confirm signup and a saved conversation after the allowance resets. See [Cloudflare's limit-enforcement notice](https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/). Do not repeat imports or change billing plans as an automatic recovery step.

Source and conversation operations use conditional database leases. Accepted message pairs persist atomically with an idempotency key and another approval check. A Worker interruption during extraction can leave a source awaiting reprocessing; unpublished sources can be reprocessed after the operation lease expires. Published text is immutable; upload a new version to change it. Unpublishing removes material from new answers while preserving saved citation snapshots.

Scheduled cleanup removes expired sessions, verification records and rate-limit counters. Source originals, conversations and audit records remain until deliberately removed. Decide retention, export and recovery policies before a public launch. Test a database export/restore and an R2 copy before migrating real user data.

## Move to the permanent account/domain

1. Freeze writes during the final cutover and follow the [FTS export procedure](SOURCE_INDEXING.md#backup-and-account-migration) before exporting D1. Use the current `cf d1 export --help` for the installed CLI's options. Copy **all** private R2 originals while preserving their keys, then verify counts and checksums. Keep the old resources until restoration and user journeys are verified.
2. Sign into the new account. Create dedicated D1/R2 resources and enable Workers AI access. Restore D1 including the migration ledger; do not replay initial migrations over an imported database. Validate foreign keys, source counts and representative conversations.
3. Update `accountId`, D1 ID/name, R2 name, Worker name if needed, and `APP_ORIGIN` in `cloudflare.config.ts`. Update the explicit account/database/origin guards in `scripts/sources/` before running future imports. Add the permanent hostname to `worker.domains` only after it is configured in the destination account.
4. Provision the original auth secret and configured OAuth secrets securely. Changing origin requires users to sign in again because cookies are host-scoped. Keep the secret needed to decrypt existing OAuth tokens.
5. Update Google authorized origins/callbacks. Build/deploy and test email login, Google linking, profiles, history, source review, real model generation, source revocation and mobile layouts on the new hostname.
6. For the public launch, deliberately update Worker robots/header policy as well as `PUBLIC_INDEXING=true` and `SITE_URL=https://your-domain` at web build time. Keep all API, auth and private pages out of indexes. Check the generated canonical URL, sitemap and structured data.
7. Redirect the old public landing page if desired. Retire old resources only after backup restoration and the new deployment are confirmed; do not delete them as part of the initial cutover.

## Validation

The Worker integration suite runs in local `workerd` with disposable D1/R2 and a separate AI fixture Worker. It checks origins, adult signup, role escalation, cross-user access, sessions, retries/leases, source extraction/review, PDF page attribution, citation retrieval and unpublishing. Synthetic material never enters the hosted knowledge base.

Live checks cover deployment health, private-page routing, admin login, learner signup, persistence, authorization and responsive Chrome rendering. The account's real Workers AI generation and embedding models were invoked successfully with neutral test inputs. See [source indexing](SOURCE_INDEXING.md) for corpus review and live retrieval validation. Automated citation checks do not constitute scholarly certification. Live Google OAuth still awaits credentials.

References: [Cloudflare project deployments](https://developers.cloudflare.com/cf/projects/), [D1](https://developers.cloudflare.com/d1/), [Workers AI models](https://developers.cloudflare.com/workers-ai/models/), [Better Auth](https://better-auth.com/docs/introduction).
