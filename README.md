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
`http://localhost:3000`.

The browser calls the same-origin `/api/backend/*` route. Next.js forwards those
requests to FastAPI on the server, so the API URL is not included in the browser
bundle and the production frontend does not require a CORS exception.

## Authentication

The frontend supports the backend's multi-user authentication flow:

- `/register` creates an account and signs the new user in.
- `/login` exchanges an email address and password for a backend access token.
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
Progress polling continues even when two polls return the same value, and the
complete Money data tree is refreshed once the background sync finishes.
Pending and user-excluded transactions remain visible but do not affect
summaries. A card-level action can delete all of that card's imported
transactions without disconnecting it; a later sync can import them again.
Monobank jars are displayed separately from local Savings Goals.

## PrivatBank FOP

Money also supports a separate Privat24 for Business connection for each
authenticated FOP user. The user pastes an AutoClient API token into a password
field. The frontend submits it once and never stores either token in browser
storage; the backend validates and encrypts the PrivatBank token with its own
Fernet key.

Create the token in Privat24 for Business under **Accounting and reports →
Integration (AutoClient) → API**. Enable service restrictions and select only
**Get account balances and transactions**. Better Tracker uses only the
official read-only settings, balances, and statement endpoints; it cannot
create payments or modify bank data.

PrivatBank sync is manual, defaults to the latest 31 calendar days, accepts a
custom inclusive period, and displays per-account progress. Imported FOP
transactions are read-only except for category and summary exclusion. Users
can delete all imported transactions for one account without disconnecting it.
While a sync runs, the UI polls only the lightweight bank connection endpoints
and updates progress in place, including immediately after a background tab is
focused again. When sync finishes, it reloads the complete Money data tree once,
including transactions, summaries, currencies, balances, and net worth.
Personal Privat24 cards are intentionally unsupported.

Use this Personal API flow only for a private owner/family deployment. A public
service must use Monobank's Provider API instead. Both the deployed frontend and
backend must use HTTPS before a personal token is submitted.

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
- Per-user encrypted PrivatBank FOP connection, selectable statement periods,
  account balances, per-account transaction deletion, and automatic Money-tree
  refresh after sync
