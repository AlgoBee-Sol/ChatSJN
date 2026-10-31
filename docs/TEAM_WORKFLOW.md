# Team access and releases

## Environments

| Purpose                     | Worker           | Database         | Private R2 bucket        |
| --------------------------- | ---------------- | ---------------- | ------------------------ |
| Live beta (`production`)    | `sjn-ai-beta`    | `sjn-ai-beta`    | `sjn-ai-beta-sources`    |
| Shared test app (`staging`) | `sjn-ai-staging` | `sjn-ai-staging` | `sjn-ai-staging-sources` |

Resource IDs and URLs live in `config/environments.ts`. Both modes use the same application code.
Staging has its own authentication secret, accounts, sources and conversations. It starts with an empty corpus.
Staging uses email/password authentication; Google is disabled until a separate staging OAuth client and callback are configured.
Both environments use the same Cloudflare account, so account quotas and billing remain shared.
The staging URL is reachable publicly, with application login required for private operations and search indexing disabled. It is not a network-private site; use only test data.

## GitHub controls

- `main`: one approving review, stale approvals dismissed, required `verify` check, resolved review conversations, linear history, no force pushes or deletion; administrators follow the same rules.
- CODEOWNERS requests reviews from `@AlgoBee-Sol` and `@frazhaider15`. The author cannot supply their own required review. Fraz must accept the invitation before GitHub recognizes his ownership.
- Squash merges keep one commit per reviewed change. Feature branches may be deleted after merge.
- GitHub environments `staging` and `production` permit deployment only from the `main` branch.
- `production` requires approval from `@AlgoBee-Sol`, with administrator bypass disabled. Self-review of a deployment is allowed so the owner can trigger and explicitly approve a release; code review still requires the other developer.

## CI and staging

`.github/workflows/ci.yml` runs repository checks, lint, type checks, application tests, source-tool tests, release-policy tests, Worker integration tests, both deployment dry runs and browser tests.
Pull requests receive no Cloudflare deployment secrets. Only a successful `main` run proceeds to staging.
The staging job applies numbered migrations, deploys with the commit SHA, and checks the actual served SHA, readiness, assets, auth origin and unauthenticated access controls.
These smoke checks do not prove signup, storage writes, answer quality or Google sign-in. Before releasing, manually check login, saved conversations, citations and source upload/review on staging with test data. Check live Google login after releasing changes that affect authentication.

## Deployment credentials: activation requirement

Create **separate** Cloudflare API tokens for staging and production. Store each as `CLOUDFLARE_API_TOKEN` in its corresponding GitHub **environment**, not as a shared repository secret.
Scope each token to its intended Worker and required bound resources wherever the available Cloudflare roles support it. The workflow deploys Worker code/assets and runs D1 migration queries; a Worker-only token without D1 query access cannot run the migrations step.
Do not grant billing, member administration, token administration or unrelated application access. If Cloudflare cannot express the necessary resource-level restriction, review the actual broader scope before enabling it; separate tokens alone do not guarantee isolation.
Runtime `BETTER_AUTH_SECRET` and Google secrets stay in Cloudflare. Bootstrap them once using a private secrets file; regular CI deployments retain them. Never copy the live auth secret into staging.

GitHub environment settings: `Settings → Environments → staging/production → Environment secrets`.
Until these secrets are installed, automated deployments cannot authenticate. The verification job remains usable.

## Release live

1. Merge the reviewed pull request and wait for **Verify application → Deploy staging** to succeed.
2. Test staging and copy the full 40-character commit SHA from that run.
3. Open **Actions → Release live → Run workflow**, select `main`, and enter that SHA.
4. Leave `apply_migrations` unchecked unless numbered migrations were reviewed, tested and a recovery plan is ready.
5. The owner reviews the exact commit and migration choice, then approves the pending `production` deployment.
6. The workflow rechecks that this is the successful current staging commit, builds that commit for live, checks pending migrations, deploys and smoke-tests the served SHA.

If staging has advanced to another commit, stage and review the intended release again before retrying. Deployment jobs are serialized and are not cancelled mid-migration or mid-release.
The target-specific binding/configuration differs between staging and live, so promotion rebuilds the same reviewed commit using the frozen dependency lockfile.

## Schema changes, source imports and recovery

Add new files under `apps/worker/migrations`; never change an already-applied migration. Prefer additive changes compatible with the previous Worker version so rollback remains possible.
Staging applies migrations automatically. Live refuses to deploy with pending migrations unless the explicit migration option was selected.
Before a risky migration, verify a usable D1 recovery point and the required R2 recovery procedure. Follow the existing [FTS-aware backup procedure](SOURCE_INDEXING.md#backup-and-account-migration); a migration ledger is not a backup.
Source collection, review and import are separate operations under [SOURCE_INDEXING.md](SOURCE_INDEXING.md). Deploying code never copies, deletes or republishes the live corpus.

For a failed release: inspect the failed smoke check and Cloudflare logs, record the commit and Worker version, and use the known-good previous version in Cloudflare's deployment controls if compatible with the current schema. Check readiness, login and saved conversations afterwards. Rolling back code does not roll back D1 or R2.
For the normal reviewed route, revert the faulty change in a new pull request, validate it on staging, then release that new commit. Do not force-push `main` or automatically reverse migrations.

## Team access

Keep individual GitHub and Cloudflare accounts with two-factor authentication. The owner keeps billing and member administration.
Fraz receives repository write access. Grant Cloudflare access to the SJN resources required for his work, with read access to live by default and editing on staging; do not give account-wide administration for routine development.
Production deployments go through the approved workflow. Cloudflare dashboard editors can deploy outside GitHub, so give live editing privileges only to designated release operators.
Review access when responsibilities change, rotate deployment tokens when necessary, and check Cloudflare error rates and usage after releases.
