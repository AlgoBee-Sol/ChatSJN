# REST API v0.1

All routes start with `/api`. Requests/responses use JSON except uploads and SSE. Shared input schemas and DTOs live in `packages/shared/src/index.ts`. Browser calls use same-origin signed cookies; do not put bearer/session tokens in localStorage.

Every business POST/PATCH/DELETE needs `Origin: <APP_ORIGIN>` and `X-SJN-Request: 1`. Better Auth `/auth/*` writes require an allowed Origin and use native Better Auth CSRF protections; their client does not need the custom header. Mutating clients without a valid browser origin are intentionally rejected until an explicit native-client auth design is added. Responses include `X-Request-ID`; API responses are no-store and noindex.

| Method | Route                                       | Behavior                                                                                  |
| ------ | ------------------------------------------- | ----------------------------------------------------------------------------------------- |
| GET    | /health                                     | Liveness and version                                                                      |
| GET    | /ready                                      | MongoDB readiness and AI configured boolean; 503 if database unavailable                  |
| POST   | /auth/sign-up/email                         | Name, email, password (12–128), age (18–120); native Better Auth response (200)           |
| POST   | /auth/sign-in/email                         | Email/password; creates Better Auth session                                               |
| POST   | /auth/sign-out                              | Revokes current session                                                                   |
| GET    | /auth/config                                | Public Google availability and configured app origin; no secrets                          |
| POST   | /auth/sign-in/social                        | `{provider: "google", callbackURL, newUserCallbackURL, errorCallbackURL}`; OAuth redirect |
| GET    | /auth/callback/google                       | Better Auth OAuth callback; validates state and exchanges authorization code              |
| POST   | /auth/link-social                           | Authenticated owner explicitly connects Google; matching email required                   |
| GET    | /auth/list-accounts                         | Better Auth list of the current user's connected providers                                |
| GET    | /auth/me                                    | Current public user; 401 if signed out                                                    |
| PATCH  | /profile                                    | Name, gender, age, Marja, language, onboardingStep; complete=true completes onboarding    |
| GET    | /sessions                                   | Current user's active sessions                                                            |
| POST   | /auth/revoke-sessions                       | Revokes all sessions, including current                                                   |
| GET    | /conversations?page=1&limit=25              | Owned active conversations, newest first                                                  |
| POST   | /conversations                              | Create an owned empty conversation                                                        |
| PATCH  | /conversations/:id                          | Rename with `{title}` (1–100 characters)                                                  |
| DELETE | /conversations/:id                          | Tombstone owned conversation and remove messages; 409 if generating                       |
| GET    | /conversations/:id/messages?page=1&limit=50 | Page 1 is latest; each page displayed chronologically                                     |
| POST   | /conversations/:id/messages                 | `{question,requestId}`; validated answer via SSE                                          |
| GET    | /admin/sources?q=&page=1&limit=25           | Admin-only title search and pagination                                                    |
| POST   | /admin/sources                              | Multipart `file` plus `metadata` JSON; extract for review                                 |
| GET    | /admin/sources/:id                          | Source metadata, extracted chunks and recent ingestion jobs                               |
| POST   | /admin/sources/:id/action                   | `{action: approve                                                                         | reject | unpublish | reprocess}` |

Native `/auth/*` responses follow Better Auth contracts (auth errors are `{code,message}`); `/auth/me` and `/auth/config` are application wrappers. The frontend uses the Better Auth client for native auth routes.

List responses use `{items,total,page,limit}`. Single resources use `{user}`, `{conversation}` or `{source}`. Message pages contain stored citation objects. Maximum page size is 50.

## SSE

Content-Type: text/event-stream. Events are JSON in `data:` lines separated by a blank line.

```text
data: {"type":"delta","text":"Validated answer segment"}

data: {"type":"done","message":{"_id":"...","role":"assistant","content":"...","citations":[],"marjaSnapshot":"SISTANI","language":"en","category":"FIQH","mode":"insufficient"}}
```

Use a new UUID per submitted question; preserve it when retrying an interrupted request. A replay of a completed UUID returns its stored `done` message. The client uses a fetch stream (POST), not EventSource. Response references are validated before any answer text is streamed. On provider/validation failure the endpoint returns a JSON error, not partial theological output.

## Errors

```json
{
  "error": {
    "code": "AI_NOT_CONFIGURED",
    "message": "AI is not connected yet…",
    "requestId": "..."
  }
}
```

Typical codes: VALIDATION_ERROR 400, UNAUTHENTICATED 401, CSRF/FORBIDDEN 403, NOT_FOUND 404, BUSY/CONFLICT/INVALID_STATE/SOURCE_CHANGED 409, RATE_LIMITED 429, INVALID_CITATIONS/INVALID_QUOTE/AI_UNAVAILABLE 502, AI_NOT_CONFIGURED/INDEX_CAPACITY 503. Error responses do not return stack traces, provider bodies or credentials.
