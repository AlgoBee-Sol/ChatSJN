# Authentication and Google sign-in

SJN uses Better Auth with the official MongoDB adapter. The self-hosted library is MIT licensed; there is no required paid authentication service. Database/hosting costs remain separate. Email/password sign-up, sign-in, Google OAuth, session revocation and explicit account linking use Better Auth. Application profiles and permissions stay in the existing Mongoose models.

## Enable Google locally

1. Create/select a project in Google Cloud and configure its OAuth consent screen (Google Auth Platform branding/audience). Add your own Google account as a test user if the project is in testing mode and requires test users.
2. Create an OAuth client with application type **Web application**.
3. Configure the authorized JavaScript origin as `http://localhost:5173` and authorized redirect URI as **`http://localhost:5173/api/auth/callback/google`**. The callback uses the frontend origin and Vite's API proxy, not API port 3001.
4. Add the following server-only values to `.env`:

   ```dotenv
   APP_ORIGIN=http://localhost:5173
   GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-client-secret
   BETTER_AUTH_SECRET=your-persistent-random-secret-at-least-32-characters
   ```

   Generate a secret with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. Keep `.env` out of version control. Do not use `VITE_` prefixes or put these values in browser code. If using the automatic local MongoDB launcher, omit `MONGODB_URI` from `.env`; the example's port 27017 is for a separately managed instance.

5. Restart `pnpm dev`, open **http://localhost:5173/login**, and select **Continue with Google**. Keep the same hostname throughout the flow. If opened at an alternate local hostname, the button first moves to the configured origin so the state cookie and callback agree.

Both Google credentials must be present. With neither configured, email authentication works and the Google button explains its availability. A partial Google configuration fails startup with a clear error. `APP_ORIGIN` explicitly supplies Better Auth's base URL; a separate `BETTER_AUTH_URL` is unnecessary here.

For live verification, create a new Google-based learner, complete adult onboarding, sign out and sign back in. Then use an email/password learner with the same email as a Google account: sign in with the password, open **Your preferences → Connected accounts → Connect Google**, and confirm Google sign-in returns to the same profile/history. Also try cancelling consent.

References: [Google web-server OAuth setup](https://developers.google.com/identity/protocols/oauth2/web-server#creatingcred), [Better Auth Google integration](https://better-auth.com/docs/authentication/google), [Express integration](https://better-auth.com/docs/integrations/express).

## Identity, sessions and permissions

- `authUsers` owns authentication identity; `authAccounts` owns Argon2id credential hashes and provider identities. OAuth access/refresh tokens are encrypted by Better Auth using the persistent auth secret.
- `authSessions` owns opaque sessions. Cookies are signed, HttpOnly, SameSite=Lax (needed for the Google callback), and Secure in production. Database session tokens are managed by Better Auth and are sensitive; they are not the previous custom SHA-256 digests. Cookie caching is disabled so revocation takes effect immediately.
- Sessions expire after seven days, with renewal at most once per day of activity. “Sign out everywhere” revokes all sessions, including the current session.
- `authVerifications` stores expiring OAuth state. State, PKCE and provider validation are delegated to Better Auth. Application hooks restrict return URLs to trusted local/site origins. Unsafe auth requests require an allowed Origin; Better Auth's origin and CSRF protections remain enabled, including during tests.
- The app profile has the same MongoDB ObjectId as the identity. Role checks always read the app database. Public requests and Google claims cannot assign `ADMIN` or bypass onboarding. New Google users have no age until they provide it; completion requires an age from 18 through 120.
- Implicit linking by matching email is disabled. Existing users must authenticate first and explicitly connect a Google account with the same email. Disconnecting Google and changing the sign-in email are not exposed in this beta.
- Express overwrites a private client-IP header from its resolved request address before calling Better Auth. Client-supplied values are ignored; proxy trust remains disabled until the deployment topology is configured. Better Auth uses this address for its database-backed rate limits.
- The native Better Auth handler is mounted before Express JSON parsing. Custom business endpoints retain the Origin plus `X-SJN-Request: 1` requirement. No session is stored in localStorage.
- Email ownership verification and password-recovery delivery need a transactional email service and are not enabled in this local beta. Google verifies its own identity; email/password accounts should not be treated as email-verified until that workflow is configured.

## Existing account migration

On API startup, `initializeAuth()` creates indexes and migrates only existing profiles with a legacy `passwordHash`. Back up any valuable database before first upgrading. The migration copies the existing ObjectId, email, dates and Argon2id hash into Better Auth identity/credential records, then removes the obsolete profile password field. It preserves profile preferences, roles and conversation ownership. It is restartable and idempotent, and stops on conflicting identity/credential records instead of merging or overwriting them. Fix a reported conflict from a verified backup before restarting.

Old `sjn_session` cookies no longer authenticate; users sign in again with their existing passwords. Old custom session documents are ignored and expire under their existing TTL index. The launcher persists its new development secret in `.local/auth-secret` when no explicit `BETTER_AUTH_SECRET` is supplied. `COOKIE_SECRET` has been replaced by `BETTER_AUTH_SECRET`. Keep the latter stable: changing it invalidates signed cookies and affects encrypted OAuth tokens.

The controlled `pnpm admin:create` command uses Better Auth to create credentials and the application database to assign `ADMIN`. Existing identities keep their passwords when promoted.

## Hosting later

Use the final HTTPS domain for `APP_ORIGIN`, register `https://YOUR-DOMAIN/api/auth/callback/google` in the production Google OAuth client, and store credentials and a persistent random `BETTER_AUTH_SECRET` in the hosting secret manager. Keep frontend and `/api/*` on one origin. Google consent branding, domain ownership and any applicable publishing requirements must be completed for the chosen audience. This change does not deploy or create a Google Cloud project.

The Node/Mongoose/Argon2 architecture remains compatible with the planned Node origin/container option described in [deployment](DEPLOYMENT.md). A pure Cloudflare Worker would require a separate runtime/storage migration; adding Better Auth alone does not make the existing API a Worker.

## Cloudflare hosted variant

The hosted beta uses Better Auth with D1 and its portable default password hashing. Local MongoDB accounts retain Argon2id. The two account stores are independent. Both variants provide password changes under Your preferences and revoke other sessions after a password change. Hosted Google configuration, callback URL and secret management are documented in [deployment](DEPLOYMENT.md#enable-google-later). Email verification and email-based recovery are not enabled.
