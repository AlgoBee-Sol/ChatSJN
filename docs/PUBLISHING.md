# Publish a clean repository

Keep application source, tests, the dependency lockfile, placeholder configuration, CI, and reviewed documentation assets in Git. Keep runtime state, secrets and private working notes on your machine.

## What stays local

`.gitignore` excludes environment files (except `.env.example`), private-key and OAuth credential files, `.local/` databases/uploads/auth secrets/test screenshots/history backups, root data/dump/upload/backup directories, dependencies, build output, test reports, caches, local Cloudflare state, editor settings, and `Reference.md`.

**No source corpus belongs on GitHub.** Keep extracted website text/HTML, PDFs, recording catalogs, source metadata, review manifests, retrieval passages, embeddings, import checkpoints, live answer reports, and database backups under `.local/`. Root `sources/`, `source-data/`, `corpus/`, `datasets/`, `archives/`, and `exports/` directories and PDF/JSONL/NDJSON/CSV/TSV/Parquet files are also excluded. Do not relocate real source content into code, fixtures, screenshots, or documentation.

Commit reusable extraction/indexing code in `scripts/sources/`, synthetic tests, schema migrations in `apps/worker/migrations/`, and documentation of the process. These are application code and instructions, not the source corpus. Documentation may describe source provenance and aggregate counts without including extracted content. Cloudflare account/resource IDs are configuration identifiers; API tokens and administrator credentials stay private.

Ignore rules do not remove files from disk. They also do not remove files already committed or their old versions from Git history. For an existing repository, `git ls-files --cached --ignored --exclude-standard` identifies ignored files that are still tracked. Review those paths before using `git rm --cached -- PATH`; do not run a blanket removal or delete the working files.

Curated screenshots in `docs/images/` are intentionally versioned. They are generated only from synthetic browser-test fixtures. Do not copy personal screenshots, database exports, uploaded source documents, or model/Google credentials into public documentation.

## Repository check

```sh
pnpm repo:check
git status --short
git diff --check
```

The repository check examines the Git index and publishable working files, catches ignored files still being tracked, rejects common source-data formats (including compressed variants) and SQL exports outside the migration directory, recognizes common credential patterns, enforces placeholder-only secret values in `.env.example`, and flags oversized files/symlinks for review. It never prints credential values. The CI workflow runs it as well. It cannot identify every possible corpus disguised as an ordinary code or text file; keep all real data in `.local/` and review the staged diff.

This is a targeted pattern check, not a guarantee that every possible secret or private fact has been detected. It does not scan old Git history. Review your diff before each commit and use the repository host's available secret-scanning protections.

## Start from clean history

For this repository restart, the previous `.git` metadata is retained under the ignored `.local/repository-backups/` directory, with a local recovery note. The original `Reference.md` and application data remain on disk. The new Git history contains only the reviewed publishable tree. Do not force-add `.local/` or copy its Git backup into a new checkout.

A clone of the fresh repository will not contain the private reference, database, local secrets, or old history. Public onboarding and implementation details are available in the README and `docs/` instead.

## Connect the replacement GitHub repository

Create an empty GitHub repository without an auto-generated README or license, then use its actual URL. From this project directory:

```sh
git status --short
pnpm repo:check
git log --oneline --all
# Replace both placeholders with the replacement repository's actual path.
git remote add origin https://github.com/YOUR-ACCOUNT/YOUR-REPOSITORY.git
git push -u origin main
```

If `origin` already exists, inspect it first and use `git remote set-url origin ACTUAL-URL` instead. Never place access tokens in the URL. A deleted remote repository is not an instruction to reuse its URL or publish automatically.

The restart preserves the old history locally but does not invalidate anything that may have been downloaded from the deleted remote. If a real secret is discovered in an earlier upload, revoke or rotate that credential with its provider; changing `.gitignore` or deleting a repository does not invalidate it.

No project-wide distribution license is added automatically. Select one intentionally before describing the project as open source.
