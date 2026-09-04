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
  assert.match(layout, /Better Tracker — Усе життя одним поглядом/);
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
  assert.match(authForm, /Підтвердьте пароль/);
  assert.match(authForm, /Великі та малі літери/);
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

test("ships Google OAuth through the existing secure session", async () => {
  const [authForm, googleRoute, auth] = await Promise.all([
    readFile(new URL("../components/auth-form.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/auth/google/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/auth.ts", import.meta.url), "utf8"),
  ]);

  assert.match(authForm, /Продовжити з Google/);
  assert.match(googleRoute, /randomBytes/);
  assert.match(googleRoute, /timingSafeEqual/);
  assert.match(googleRoute, /code_challenge/);
  assert.match(googleRoute, /\/api\/v1\/auth\/google\/authorize/);
  assert.match(googleRoute, /\/api\/v1\/auth\/google\/exchange/);
  assert.match(googleRoute, /httpOnly: true/);
  assert.match(googleRoute, /sameSite: "lax"/);
  assert.match(googleRoute, /setSessionCookie/);
  assert.match(auth, /googleAuthErrorMessage/);
  assert.doesNotMatch(googleRoute, /localStorage|sessionStorage/);
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

test("opens spending categories as editable transaction ledgers", async () => {
  const [dashboard, moneyRoute, money, moduleApi] = await Promise.all([
    readFile(new URL("../app/dashboard-page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/(modules)/money/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/(modules)/money/money-page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/module-api.ts", import.meta.url), "utf8"),
  ]);

  assert.match(dashboard, /pathname: "\/money"/);
  assert.match(dashboard, /category: category\.name/);
  assert.match(moneyRoute, /initialCategory=\{category\}/);
  assert.match(money, /initialCategory \? "cashflow" : "overview"/);
  assert.match(money, /onClick=\{\(\) => setCategoryFilter\(item\.category\)\}/);
  assert.match(money, /Back to overview/);
  assert.match(money, /setDialog\(\{ kind: "transaction", record: transaction \}\)/);
  assert.match(moduleApi, /fetchMoneyCategoryTransactions/);
  assert.match(moduleApi, /kind: category \? "expense" : undefined/);
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
  assert.match(moduleApi, /updateMonobankAccountTracking/);
  assert.match(moduleApi, /updateMonobankJarTracking/);
  assert.match(moduleApi, /is_tracked/);
  assert.match(moduleApi, /\/integrations\/monobank\/accounts\/\$\{accountId\}\/transactions/);
  assert.match(moduleApi, /\/finance\/currencies/);
  assert.match(money, /type="password"/);
  assert.match(money, /Connect Monobank/);
  assert.match(money, /monobankSyncDateFrom/);
  assert.match(money, /monobankSyncDateTo/);
  assert.match(money, /Delete imports/);
  assert.match(money, /Tracked sources/);
  assert.match(money, /Sync tracked cards/);
  assert.match(moduleApi, /fetchMoneyTrackingSummary/);
  const trackingHandler = money.slice(
    money.indexOf("const setMonobankAccountTracking"),
    money.indexOf("const removeMonobankConnection"),
  );
  assert.doesNotMatch(trackingHandler, /setIntegrationBusy/);
  assert.doesNotMatch(trackingHandler, /\brefresh\(\)/);
  assert.match(money, /sync_progress_current/);
  assert.match(moduleApi, /fetchMonobankConnection/);
  assert.match(money, /window\.setInterval\(\(\) => void pollConnections\(\), 2500\)/);
  assert.match(money, /visibilitychange/);
  assert.match(money, /updateData/);
  assert.doesNotMatch(money, /window\.setInterval\(refresh/);
  assert.match(money, /Money data refreshed/);
  assert.match(money, /Select money currency/);
  assert.match(money, /"UAH"/);
  assert.match(money, /data\.monobank\.client_name/);
  assert.match(money, /Очікує/);
  assert.match(money, /Виключено/);
  assert.match(money, /Ignored source/);
  assert.match(environmentExample, /HTTPS backend URL/);
  assert.match(readme, /never writes it to local or session storage/);

  for (const source of [money, moduleApi]) {
    assert.doesNotMatch(source, /localStorage|sessionStorage/);
  }
});

test("ships the Money overview and source management views", async () => {
  const [money, moduleApi, moduleUi, styles] = await Promise.all([
    readFile(new URL("../app/(modules)/money/money-page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/module-api.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/module-ui.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  for (const tab of ["overview", "cashflow", "wealth", "sources"]) {
    assert.match(money, new RegExp(`money-tab-${tab}`));
  }
  assert.match(money, /MonthPickerInput/);
  assert.match(money, /\[1, 3, 6, 12\]/);
  assert.match(moduleApi, /fetchMoneyOverview/);
  assert.match(moduleApi, /Promise\.all\(moneyMonthRange/);
  assert.match(moduleApi, /include_ignored: includeIgnored/);
  assert.match(money, /aria-expanded=\{group\.expanded\}/);
  assert.match(money, /slice\(0, 3\)/);
  assert.match(moduleUi, /periodKey\?: string/);
  assert.match(moduleUi, /supportsMonthInput/);
  assert.match(moduleUi, /month-picker-fallback/);
  assert.match(styles, /\.overview-status-grid/);
  assert.match(styles, /\.overview-period-presets/);
  assert.match(styles, /@media \(max-width: 720px\)/);
});

test("keeps dashboard summaries comparable, navigable, and readable", async () => {
  const [dashboard, trackerApi, nutrition, body, moduleData, money, styles] = await Promise.all([
    readFile(new URL("../app/dashboard-page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/tracker-api.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/(modules)/nutrition/nutrition-page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/(modules)/body/body-page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../hooks/use-module-data.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/(modules)/money/money-page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(trackerApi, /currency = "UAH"/);
  assert.match(trackerApi, /\/finance\/currencies/);
  assert.match(dashboard, /dashboard-currency-picker/);
  assert.match(dashboard, /view: "wealth"/);
  assert.match(nutrition, /const chartMaximum = Math\.max/);
  assert.doesNotMatch(nutrition, /const maximum = Math\.max\(log\.calories/);
  assert.match(body, /body-chart-dates/);
  assert.match(moduleData, /data:\s*result\.data,/);
  assert.doesNotMatch(moduleData, /data:\s*result\.dataKey\s*===\s*periodKey/);
  assert.match(money, /hasMonthlyBudget \? money/);
  assert.match(styles, /\.skip-link/);
  assert.match(styles, /min-height: 44px/);
  assert.match(styles, /\.refresh-surface\.is-refreshing/);

  const periodChange = dashboard.slice(dashboard.indexOf("const changePeriod"), dashboard.indexOf("const changeCurrency"));
  const currencyChange = dashboard.slice(dashboard.indexOf("const changeCurrency"), dashboard.indexOf("const openLog"));
  assert.doesNotMatch(periodChange, /setDashboard\(null\)/);
  assert.doesNotMatch(currencyChange, /setDashboard\(null\)/);

  const quickLog = dashboard.slice(dashboard.indexOf("const handleLog"), dashboard.indexOf("const undoLastLog"));
  assert.match(quickLog, /currency:\s*currencyKey/);
  for (const [start, end] of [
    ["const saveTransaction", "const saveMonobankConnection"],
    ["const saveBudget", "const saveAccount"],
    ["const saveAccount", "const saveGoal"],
    ["const saveGoal", "const saveContribution"],
  ]) {
    assert.match(money.slice(money.indexOf(start), money.indexOf(end)), /currency:\s*dialog\.record\?\.currency\s*\?\?\s*selectedCurrency/);
  }
  assert.match(money.slice(money.indexOf("const captureSnapshot"), money.indexOf("const dialogTitle")), /currency:\s*selectedCurrency/);
});

test("deletes transactions without reloading the full Money data tree", async () => {
  const [money, moduleApi] = await Promise.all([
    readFile(new URL("../app/(modules)/money/money-page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/module-api.ts", import.meta.url), "utf8"),
  ]);

  assert.match(moduleApi, /deleteAllTransactions/);
  assert.match(moduleApi, /fetchMoneyTransactionSummary/);
  assert.match(money, /Delete all transactions/);
  assert.match(money, /Видалити всі/);

  const handlers = [
    money.slice(
      money.indexOf("const removeMonobankTransactions"),
      money.indexOf("const setMonobankAccountTracking"),
    ),
    money.slice(
      money.indexOf("const removeTransaction"),
      money.indexOf("const remove ="),
    ),
  ];
  for (const handler of handlers) {
    assert.doesNotMatch(handler, /setIntegrationBusy/);
    assert.doesNotMatch(handler, /\brefresh\(\)/);
    assert.match(handler, /updateData/);
  }
});

test("does not ship the removed PrivatBank integration", async () => {
  const [money, moduleApi, styles, readme] = await Promise.all([
    readFile(new URL("../app/(modules)/money/money-page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/module-api.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
  ]);

  for (const source of [money, moduleApi, styles, readme]) {
    assert.doesNotMatch(source, /privatbank|privat24/i);
  }
});

test("localizes the UI per user in Ukrainian", async () => {
  const [i18n, auth, preferences, shell, dashboard, layout] = await Promise.all([
    readFile(new URL("../lib/i18n.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/auth/preferences/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/module-shell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/dashboard-page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(auth, /locale: "en" \| "uk"/);
  assert.match(i18n, /\/api\/auth\/preferences/);
  assert.match(preferences, /\/api\/v1\/auth\/me/);
  assert.match(shell, /Фінанси/);
  assert.match(dashboard, /Усе ваше життя — одним поглядом/);
  assert.match(layout, /html lang="uk"/);
  assert.doesNotMatch(shell, /Every edit on these pages saves directly to FastAPI/);
});
