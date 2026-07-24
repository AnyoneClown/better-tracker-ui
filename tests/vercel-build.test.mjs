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
  const [page, layout, packageJson, favicon] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../public/favicon.svg", import.meta.url), "utf8"),
  ]);

  assert.match(page, /better-tracker-demo/);
  assert.match(page, /BETTER TRACKER/);
  assert.match(page, /Better Tracker keeps your personal progress/);
  assert.match(page, /Quick log/);
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
