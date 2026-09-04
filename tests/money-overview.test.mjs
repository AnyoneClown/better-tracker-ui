import assert from "node:assert/strict";
import test from "node:test";

import { moneyMonthRange, summarizeMoney } from "../lib/money-overview.ts";

function summary(month, income = 0, expenses = 0, budget = 0, categories = []) {
  return { year: 2026, month, total_income: income, total_expenses: expenses, total_budget: budget, categories };
}

test("builds inclusive overview ranges from one through twelve months", () => {
  assert.deepEqual(moneyMonthRange("2026-09", "2026-09"), ["2026-09"]);
  assert.equal(moneyMonthRange("2026-04", "2026-09").length, 6);
  assert.equal(moneyMonthRange("2025-10", "2026-09").length, 12);
  assert.throws(() => moneyMonthRange("2025-09", "2026-09"));
  assert.throws(() => moneyMonthRange("2026-13", "2026-13"));
});

test("aggregates overview metrics and uses the latest month's budget", () => {
  const data = summarizeMoney([
    summary(8, 1000, 300, 500, [
      { category: "one", expenses: 100 },
      { category: "two", expenses: 60 },
      { category: "three", expenses: 50 },
    ]),
    summary(9, 500, 200, 300, [
      { category: "one", expenses: 50 },
      { category: "four", expenses: 40 },
      { category: "five", expenses: 30 },
      { category: "six", expenses: 20 },
      { category: "seven", expenses: 10 },
    ]),
  ]);

  assert.equal(data.totalIncome, 1500);
  assert.equal(data.totalExpenses, 500);
  assert.equal(data.averageExpenses, 250);
  assert.equal(data.net, 1000);
  assert.equal(Math.round(data.budgetUsage), 67);
  assert.equal(data.budgetMonthExpenses, 200);
  assert.equal(data.budgetMonthTotal, 300);
  assert.equal(data.categoryShares.length, 7);
  assert.deepEqual(data.categoryShares.at(-1), { category: "seven", expenses: 10 });
});

test("uses clean zero-income and zero-budget states", () => {
  const data = summarizeMoney([summary(9)]);
  assert.equal(data.savingsRate, null);
  assert.equal(data.budgetUsage, null);
  assert.equal(data.averageExpenses, 0);
  assert.deepEqual(data.categoryShares, []);
});
