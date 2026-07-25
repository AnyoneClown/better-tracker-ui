import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("produces a standard Next.js build", async () => {
  await Promise.all([
    access(new URL("../.next/BUILD_ID", import.meta.url)),
    access(new URL("../.next/routes-manifest.json", import.meta.url)),
    access(new URL("../.next/server/app-paths-manifest.json", import.meta.url)),
  ]);
});

test("keeps the Better Tracker dashboard and Vercel metadata intact", async () => {
  const [page, entryPage, layout, packageJson, favicon, apiClient, proxyRoute, backend] = await Promise.all([
    readFile(new URL("../app/dashboard-page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../public/favicon.svg", import.meta.url), "utf8"),
    readFile(new URL("../lib/tracker-api.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/backend/[...path]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/backend.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /BETTER TRACKER/);
  assert.match(page, /records from your FastAPI backend/);
  assert.match(page, /Quick log/);
  assert.match(page, /fetchDashboard/);
  assert.doesNotMatch(page, /onClick=\{refreshData\} disabled=/);
  assert.match(apiClient, /\/finance\/summary/);
  assert.match(apiClient, /\/workouts\/summary/);
  assert.match(apiClient, /\/health\/summary/);
  assert.match(apiClient, /\/wealth\/summary/);
  assert.match(entryPage, /requireAuthenticatedUser/);
  assert.match(proxyRoute, /AUTH_COOKIE_NAME/);
  assert.match(backend, /BETTER_TRACKER_API_URL/);
  assert.doesNotMatch(page, /localStorage|monthPresets|initialActivities/);
  assert.match(layout, /VERCEL_URL/);
  assert.match(layout, /Better Tracker — Your life, in one view/);
  assert.match(packageJson, /"name": "better-tracker"/);
  assert.match(packageJson, /"build": "next build"/);
  assert.match(favicon, /M7 22\.5L12\.2 16\.9/);
  assert.doesNotMatch(page, /Northstar|NORTHSTAR/);
  assert.doesNotMatch(layout, /Northstar|NORTHSTAR/);
  assert.doesNotMatch(packageJson, /vinext|wrangler|cloudflare|vite/i);
});

test("ships secure multi-user authentication", async () => {
  const [
    authForm,
    accountSummary,
    loginPage,
    registerPage,
    loginRoute,
    registerRoute,
    logoutRoute,
    sessionCookie,
    serverAuth,
    backendProxy,
    apiClient,
    requestSecurity,
  ] = await Promise.all([
    readFile(new URL("../components/auth-form.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/account-summary.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/(auth)/login/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/(auth)/register/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/auth/login/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/auth/register/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/auth/logout/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/session-cookie.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/server-auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/backend/[...path]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/tracker-api.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/request-security.ts", import.meta.url), "utf8"),
  ]);

  assert.match(authForm, /mode="login"|mode: AuthMode/);
  assert.match(authForm, /Confirm password/);
  assert.match(authForm, /Upper and lowercase/);
  assert.match(loginPage, /getAuthenticatedUser/);
  assert.match(registerPage, /getAuthenticatedUser/);
  assert.match(loginRoute, /\/api\/v1\/auth\/login/);
  assert.match(registerRoute, /\/api\/v1\/auth\/register/);
  assert.match(registerRoute, /setSessionCookie/);
  assert.match(logoutRoute, /clearSessionCookie/);
  assert.match(accountSummary, /\/api\/auth\/logout/);
  assert.match(sessionCookie, /httpOnly: true/);
  assert.match(sessionCookie, /sameSite: "lax"/);
  assert.match(serverAuth, /\/api\/v1\/auth\/me/);
  assert.match(backendProxy, /Authorization|authorization/);
  assert.match(backendProxy, /Bearer \$\{accessToken\}/);
  assert.match(backendProxy, /Use the frontend authentication routes/);
  assert.match(apiClient, /response\.status === 401/);
  assert.match(requestSecurity, /sec-fetch-site/);
  assert.match(requestSecurity, /origin === request\.nextUrl\.origin \|\| origin === hostOrigin/);

  for (const source of [authForm, accountSummary, loginRoute, registerRoute, sessionCookie]) {
    assert.doesNotMatch(source, /localStorage|sessionStorage/);
  }
});

test("removes the previous Sites runtime surface", async () => {
  await Promise.all([
    assert.rejects(access(new URL("../.openai", import.meta.url))),
    assert.rejects(access(new URL("../vite.config.ts", import.meta.url))),
    assert.rejects(access(new URL("../worker", import.meta.url))),
    assert.rejects(access(new URL("../build", import.meta.url))),
  ]);
});

test("ships routed modules backed by FastAPI CRUD", async () => {
  const [
    shell,
    moduleApi,
    money,
    training,
    nutrition,
    body,
  ] = await Promise.all([
    readFile(new URL("../components/module-shell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/module-api.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/(modules)/money/money-page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/(modules)/training/training-page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/(modules)/nutrition/nutrition-page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/(modules)/body/body-page.tsx", import.meta.url), "utf8"),
  ]);

  for (const href of ["/money", "/training", "/nutrition", "/body"]) {
    assert.match(shell, new RegExp(`href: "${href}"`));
  }
  assert.match(moduleApi, /\/finance\/transactions/);
  assert.match(moduleApi, /\/wealth\/accounts/);
  assert.match(moduleApi, /\/workouts\?\$\{range\}/);
  assert.match(moduleApi, /\/health\/nutrition/);
  assert.match(moduleApi, /\/health\/weights/);
  assert.match(money, /net-worth-snapshots\/capture/);
  assert.match(money, /savings-contributions/);
  assert.match(training, /Exercise sets/);
  assert.match(nutrition, /updateRecord<NutritionLog>/);
  assert.match(body, /updateRecord<WeightEntry>/);
  for (const page of [money, training, nutrition, body]) {
    assert.match(page, /deleteRecord/);
    assert.match(page, /ModuleHeader/);
  }
});

test("ships the secure manual Monobank connection flow", async () => {
  const [money, moduleApi, environmentExample, readme] = await Promise.all([
    readFile(new URL("../app/(modules)/money/money-page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/module-api.ts", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
  ]);

  assert.match(moduleApi, /\/integrations\/monobank\/connection/);
  assert.match(moduleApi, /\/integrations\/monobank\/sync/);
  assert.match(moduleApi, /\/integrations\/monobank\/accounts\/\$\{accountId\}\/transactions/);
  assert.match(moduleApi, /\/finance\/currencies/);
  assert.match(money, /type="password"/);
  assert.match(money, /Connect Monobank/);
  assert.match(money, /Sync period/);
  assert.match(money, /monobankSyncDateFrom/);
  assert.match(money, /monobankSyncDateTo/);
  assert.match(money, /Delete imported transactions/);
  assert.match(money, /sync_progress_current/);
  assert.match(money, /window\.setInterval\(refresh/);
  assert.match(money, /Money data refreshed/);
  assert.match(money, /Select money currency/);
  assert.match(money, /"UAH"/);
  assert.match(money, />Monobank</);
  assert.match(money, />Pending</);
  assert.match(money, />Excluded</);
  assert.match(money, /Separate from local Savings Goals/);
  assert.match(environmentExample, /HTTPS backend URL/);
  assert.match(readme, /never writes it to local or session storage/);

  for (const source of [money, moduleApi]) {
    assert.doesNotMatch(source, /localStorage|sessionStorage/);
  }
});

test("ships the read-only PrivatBank FOP connection flow", async () => {
  const [money, moduleApi, readme] = await Promise.all([
    readFile(new URL("../app/(modules)/money/money-page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/module-api.ts", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
  ]);

  assert.match(moduleApi, /\/integrations\/privatbank\/connection/);
  assert.match(moduleApi, /\/integrations\/privatbank\/sync/);
  assert.match(moduleApi, /\/integrations\/privatbank\/accounts\/\$\{accountId\}\/transactions/);
  assert.match(moduleApi, /source: "manual" \| "monobank" \| "privatbank"/);
  assert.match(money, /Connect PrivatBank FOP/);
  assert.match(money, /Privat24 Business API token/);
  assert.match(money, /privatBankSyncDateFrom/);
  assert.match(money, /privatBankSyncDateTo/);
  assert.match(money, /PrivatBank sync complete\. Money data refreshed\./);
  assert.match(money, /privatBankSyncAwaitingRefresh/);
  assert.match(money, /privatBankSyncBaseline/);
  assert.match(money, /last_sync_started_at/);
  assert.match(money, />PrivatBank FOP</);
  assert.match(money, /Get account balances and transactions/);
  assert.match(readme, /PrivatBank FOP/);
  assert.match(readme, /never stores either token in browser\s+storage/);

  for (const source of [money, moduleApi]) {
    assert.doesNotMatch(source, /localStorage|sessionStorage/);
  }
});
