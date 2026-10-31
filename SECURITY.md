# Secrets and repository security

Report a suspected credential exposure privately to the repository owner. Do not paste a token, password, private source text or real user conversation into a public issue or pull request.

## What belongs where

| Value                                                                              | Storage                                                                                            |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Cloudflare deployment API token                                                    | GitHub Actions environment secret `CLOUDFLARE_API_TOKEN`, separately in `staging` and `production` |
| Application auth secret and Google OAuth client secret                             | Cloudflare Worker secrets; private local backups only                                              |
| Local development credentials                                                      | Ignored `.env` or `.local/` files with private filesystem permissions                              |
| Account/database identifiers, Worker names, public OAuth client ID and origin URLs | Versioned configuration; these identify resources but do not authenticate access                   |
| Real corpora, uploads, database exports and user conversations                     | Private application storage or ignored local archives                                              |

Never put credentials in `VITE_*` variables: frontend build variables can become public browser assets.
`.env.example` contains placeholders, not usable credentials. Use individual accounts and two-factor authentication; do not share the owner's login or local OAuth credentials.

## Prevention

The required `verify` job scans complete fetched Git history using Gitleaks 8.30.1, downloaded from its official release and checked against a pinned SHA-256 digest. Findings are redacted. The existing `pnpm repo:check` also rejects tracked ignored files, corpus/dump files and recognized credential patterns.
GitHub secret scanning and push protection are enabled. These controls reduce risk but do not prove a repository contains no secrets.
Review any `.gitleaksignore` change carefully. The current exception is one exact historical fingerprint for a SQL migration filename in a test fixture; it does not exclude an entire file or rule.

## If a credential is exposed

1. Revoke or rotate it at its provider first. Deleting the current file does not invalidate a copied credential.
2. Update the affected Worker or GitHub environment secret and verify the relevant application flow.
3. Remove the credential from tracked content. If history rewriting is necessary, coordinate with both developers, preserve a private recovery copy, and account for branches, tags, pull-request refs and cached views.
4. Re-scan and review provider audit logs. Do not rewrite history or rotate unrelated secrets merely because a public resource identifier appears in configuration.

## Audit: 1 November 2026 (Pakistan time)

The audit covered all 15 commits reachable from the fetched branches/tags at the time, including Dependabot branches, and 250 unique file blobs. GitHub reported no open secret-scanning alerts. Six locally stored project credential values were also compared against those blobs without printing them; no matches were found.
Gitleaks reported one SQL migration filename in a historical Worker test fixture, reviewed as a false positive and narrowly recorded in `.gitleaksignore`. No real exposed credential was identified in this audit, so no credential revocation or Git history rewrite was warranted.
This record describes the inspected snapshot, not a guarantee about future commits, external copies, unreachable objects, or every GitHub artifact.
