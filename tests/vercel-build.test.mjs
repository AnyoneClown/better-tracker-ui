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
  const [page, layout, packageJson, favicon, apiClient, proxyRoute] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../public/favicon.svg", import.meta.url), "utf8"),
    readFile(new URL("../lib/tracker-api.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/backend/[...path]/route.ts", import.meta.url), "utf8"),
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
  assert.match(proxyRoute, /BETTER_TRACKER_API_URL/);
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
