# Better Tracker frontend

Better Tracker is a Next.js dashboard for money, training, nutrition, body
weight, savings, and net worth. The dashboard reads and writes live data through
the Better Tracker FastAPI service.

## Local development

Requires Node.js 24 and a running Better Tracker backend.

```bash
npm install
cp .env.example .env.local
npm run dev
```

`BETTER_TRACKER_API_URL` defaults to `http://127.0.0.1:8000` during local
development. Set it in `.env.local` when the API uses another address, then open
`http://localhost:43127`. The development server listens on all interfaces, so
this Raspberry Pi is also available at <http://192.168.0.103:43127>.

To enable Google sign-in, create a Google OAuth 2.0 Web application and add
`http://localhost:43127/api/auth/google` as an authorized redirect URI. Set its
client ID and secret on the backend as `GOOGLE_OAUTH_CLIENT_ID` and
`GOOGLE_OAUTH_CLIENT_SECRET`.

The browser calls the same-origin `/api/backend/*` route. Next.js forwards those
requests to FastAPI on the server, so the API URL is not included in the browser
bundle and the production frontend does not require a CORS exception.

### Persistent Raspberry Pi service

After starting the backend's production Compose stack, build and run the
frontend as a restart-enabled container:

```bash
docker compose up -d --build --wait
```

The frontend joins the backend's private Docker network, while only port
`43127` is published to the LAN. FastAPI and CockroachDB remain private.
`.env.local` sets `BETTER_TRACKER_COOKIE_SECURE=false` because the Pi is served
over plain HTTP; production HTTPS deployments should omit that override or set
it to `true`.

Google rejects OAuth callbacks that use a raw LAN IP over HTTP. Google sign-in
on the Pi therefore requires either an SSH tunnel opened as `localhost` or a
real HTTPS hostname whose exact callback is registered in the Google OAuth
client. Email/password sign-in works directly at the LAN address.

## Authentication

The frontend supports the backend's multi-user authentication flow:

- `/register` creates an account and signs the new user in.
- `/login` exchanges an email address and password for a backend access token.
- `/api/auth/google` runs the Google authorization-code flow with state and S256
  PKCE, then stores the resulting Better Tracker token in the same session cookie.
- The Next.js auth route stores that token in an `HttpOnly`, same-site cookie;
  browser JavaScript never receives or persists the bearer token.
- State-changing proxy and authentication requests reject foreign browser
  origins, providing an additional CSRF boundary around the session cookie.
- Server-rendered dashboard routes validate the session with
  `GET /api/v1/auth/me` before rendering.
- The same-origin backend proxy adds the bearer token to every tracker request,
  clears an invalid session after a `401`, and the client returns the user to
  login when a session expires.
- Signing out removes the frontend session cookie. The backend does not expose a
  token-revocation endpoint, so an access token otherwise remains valid until its
  configured expiration time.

The backend also needs its `JWT_SECRET_KEY`, issuer, audience, and token lifetime
settings configured as described in the backend README.

The Money ledger has a destructive **Delete all** action that clears the signed-in
user's transactions across every period, currency, and source after explicit
confirmation. Individual manual deletes and per-bank-account imported deletes
update the visible ledger and cash-flow summary in place, so they do not trigger
a full Money-page loading state. A future bank sync can re-import bank data.

## Monobank

The Money workspace supports a separate Monobank Personal API connection for
each authenticated user. A user pastes the token into a password field; the
browser submits it once and never writes it to local or session storage. The
backend validates and encrypts it, and subsequent status responses contain only
safe client, card, jar, progress, and timestamp fields.

Money defaults to UAH and offers every other currency present in local or
Monobank data as a separate view without FX conversion. Sync is manual and
returns immediately while the backend imports card statements in the
background. The date picker defaults to the latest 31 calendar days; users can
select a longer historical period, which the backend imports in 31-day batches.
Each card has its own tracking checkbox. Only tracked cards contribute their
balances to wealth totals and have statements imported; cards that are turned
off stay visible and can be enabled again later. Previously imported
transactions remain in the ledger until the user deletes them explicitly.
Progress polling continues even when two polls return the same value, and the
complete Money data tree is refreshed once the background sync finishes.
Pending and user-excluded transactions remain visible but do not affect
summaries. A card-level action can delete all of that card's imported
transactions without disconnecting it; a later sync can import them again.
Monobank jars are displayed separately from local Savings Goals.

## Validate

```bash
npm run lint
npm run typecheck
npm test
```

## Deploy to Vercel

This is a standard Next.js App Router project. The production project is
`better-tracker` and is available at https://better-tracker-sigma.vercel.app.
Configure a publicly reachable backend URL for Production, Preview, and
Development before deploying:

```bash
vercel link
vercel env add BETTER_TRACKER_API_URL production preview development
vercel --prod
```

Also add `https://better-tracker-sigma.vercel.app/api/auth/google` to the Google
OAuth client's authorized redirect URIs. Each preview domain needs its own exact
redirect URI if Google sign-in should work there.

The value should be the backend origin, for example
`https://api.example.com`, without `/api/v1` at the end. Vercel cannot reach a
backend that only listens on `localhost`. Use an HTTPS origin in production,
especially when bank connections are enabled.

## Current data flow

- Responsive overview dashboard
- Current month plus the previous two monthly views
- Live finance, workout, nutrition, weight, wealth, goal, snapshot, and activity data
- Quick logging for expenses, income, workouts, meals, weight, and savings
- Backend-aware undo for newly created and updated records
- Same-day nutrition aggregation and weight-entry updates that match the API model
- Loading, empty, refresh, and backend error states
- Account registration, login, authenticated route protection, session-expiry
  recovery, and logout
- Per-user tracker records provided by the backend's ownership checks
- Per-user encrypted Monobank connection, manual sync progress, read-only bank
  transactions, UAH-first currency views, cards, credit limits, and jars
