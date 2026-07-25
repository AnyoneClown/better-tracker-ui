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
backend that only listens on `localhost`.

## Current data flow

- Responsive overview dashboard
- Current month plus the previous two monthly views
- Live finance, workout, nutrition, weight, wealth, goal, snapshot, and activity data
- Quick logging for expenses, income, workouts, meals, weight, and savings
- Backend-aware undo for newly created and updated records
- Same-day nutrition aggregation and weight-entry updates that match the API model
- Loading, empty, refresh, and backend error states

The API is currently single-user and does not expose authentication. Add an auth
layer before making private tracker data available on a public backend URL.
