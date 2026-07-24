# Better Tracker frontend

Better Tracker is a frontend-only personal tracking MVP for money, training,
nutrition, body weight, savings, and net worth. It uses realistic demo data and
stores quick-log changes in the browser so the experience can be tested before
an API is connected.

## Local development

Requires Node.js 24.

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Validate

```bash
npm run lint
npm run typecheck
npm test
```

## Deploy to Vercel

This is a standard Next.js App Router project and needs no custom Vercel build
configuration. The production project is `better-tracker` and is available at
https://better-tracker-sigma.vercel.app. Link the folder once, then deploy:

```bash
vercel link
vercel --prod
```

The app currently requires no environment variables.

## Current scope

- Responsive overview dashboard
- Monthly demo views for May, June, and July 2026
- Quick logging for expenses, income, workouts, meals, weight, and savings
- Immediate metric and activity updates with undo
- Device-local persistence via `localStorage`
- No API calls, authentication, or database integration

The state model is intentionally small so a future FastAPI client can replace
the local demo adapter without changing the visual system.
