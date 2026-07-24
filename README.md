# Northstar frontend

Northstar is a frontend-only personal tracking MVP for money, training,
nutrition, body weight, savings, and net worth. It uses realistic demo data and
stores quick-log changes in the browser so the experience can be tested before
an API is connected.

## Run locally

Requires Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Validate

```bash
npm run lint
npm test
```

## Current scope

- Responsive overview dashboard
- Monthly demo views for May, June, and July 2026
- Quick logging for expenses, income, workouts, meals, weight, and savings
- Immediate metric and activity updates with undo
- Device-local persistence via `localStorage`
- No API calls, authentication, or database integration

The state model is intentionally small so a future FastAPI client can replace
the local demo adapter without changing the visual system.
