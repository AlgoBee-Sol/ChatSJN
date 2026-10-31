# Working together on SJN AI

Muhammad and Fraz work in the same repository with individual GitHub accounts.
Use a small branch per task, open a pull request, and have the other developer review it.
`main` is the reviewed integration branch. Do not push directly, force-push it, or bypass review.

## First setup

1. Accept the repository invitation and enable two-factor authentication on your account.
2. Install Node.js 24 (`.nvmrc`) and pnpm 10.28.2.
3. Clone `https://github.com/AlgoBee-Sol/ChatSJN.git` and run `pnpm install --frozen-lockfile`.
4. Run `pnpm dev`. Without `MONGODB_URI`, the launcher starts a local MongoDB and generates a local authentication secret.
5. Open `http://localhost:5173` and create your own test account. Use `.env.example` as a reference when you need custom settings; its MongoDB URI expects an already-running server.

Get development-only service credentials privately from the owner if your task needs them.
Real corpora, live accounts, uploads, credentials and database dumps are deliberately absent from Git.
Follow [SECURITY.md](SECURITY.md) for credential storage and reporting suspected exposure.
The app can run without a corpus; use a small authorized sample through Source studio for retrieval work.
Never connect your laptop or staging app to the live database to obtain test data.

## Daily workflow

```sh
git switch main
git pull --ff-only
git switch -c feature/short-task-name
# Make the change.
pnpm lint
pnpm typecheck
pnpm test
pnpm test:ci
pnpm test:worker
git add <specific-files>
git commit -m "feat: describe the user-visible change"
git push -u origin feature/short-task-name
```

Open a pull request on GitHub, fill its template, and request the other person's review.
Resolve comments and wait for `verify` to pass, then squash-merge. Delete the merged task branch.
Create a GitHub Issue for each task and agree who owns it before starting overlapping work.

## Code map

| Path                     | Responsibility                                |
| ------------------------ | --------------------------------------------- |
| `apps/web`               | React interface                               |
| `apps/worker`            | Hosted Cloudflare backend and D1 migrations   |
| `apps/api`               | Local Express/MongoDB backend                 |
| `packages/shared`        | Shared schemas and educational policy         |
| `scripts/sources`        | Reviewed source import and verification tools |
| `config/environments.ts` | Staging/live resource identifiers             |

Local Express/MongoDB and hosted Workers/D1 are different backends. A local pass alone is insufficient for hosted changes: run Worker tests and check staging.
Use the pinned `cf` CLI and existing package scripts; do not add a parallel Wrangler configuration.

## Releases and data

Merging to `main` runs all checks and then deploys staging. A separate approved workflow releases live.
Follow [the team release runbook](docs/TEAM_WORKFLOW.md) for setup, promotion, migrations and recovery.
Source imports are separate reviewed operations, never part of deployment.
For AI changes, record representative English, Urdu and Roman Urdu questions, expected sources and checked citations in the pull request. Do not commit real user conversations.
