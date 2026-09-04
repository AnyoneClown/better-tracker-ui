export type MoneySummary = {
  year: number;
  month: number;
  total_income: string | number;
  total_expenses: string | number;
  total_budget: string | number;
  categories: Array<{ category: string; expenses: string | number }>;
};

export function moneyMonthRange(startMonth: string, endMonth: string): string[] {
  const [startYear, start] = startMonth.split("-").map(Number);
  const [endYear, end] = endMonth.split("-").map(Number);
  const valid = (value: string, month: number) => /^\d{4}-\d{2}$/.test(value) && month >= 1 && month <= 12;
  const first = startYear * 12 + start - 1;
  const last = endYear * 12 + end - 1;
  if (!valid(startMonth, start) || !valid(endMonth, end) || last < first || last - first >= 12) {
    throw new Error("Choose a contiguous range of up to 12 months.");
  }
  return Array.from({ length: last - first + 1 }, (_, index) => {
    const value = first + index;
    return `${Math.floor(value / 12)}-${String(value % 12 + 1).padStart(2, "0")}`;
  });
}

export function summarizeMoney(summaries: MoneySummary[]) {
  const number = (value: string | number) => Number(value) || 0;
  const totalIncome = summaries.reduce((sum, summary) => sum + number(summary.total_income), 0);
  const totalExpenses = summaries.reduce((sum, summary) => sum + number(summary.total_expenses), 0);
  const totalBudget = summaries.reduce((sum, summary) => sum + number(summary.total_budget), 0);
  const budgetMonth = summaries.at(-1);
  const budgetMonthExpenses = number(budgetMonth?.total_expenses ?? 0);
  const budgetMonthTotal = number(budgetMonth?.total_budget ?? 0);
  const categories = new Map<string, number>();
  summaries.forEach((summary) => summary.categories.forEach((category) => {
    const expenses = number(category.expenses);
    if (expenses > 0) categories.set(category.category, (categories.get(category.category) ?? 0) + expenses);
  }));
  const sortedCategories = Array.from(categories, ([category, expenses]) => ({ category, expenses }))
    .sort((left, right) => right.expenses - left.expenses);
  return {
    summaries,
    totalIncome,
    totalExpenses,
    totalBudget,
    net: totalIncome - totalExpenses,
    averageExpenses: summaries.length ? totalExpenses / summaries.length : 0,
    savingsRate: totalIncome ? ((totalIncome - totalExpenses) / totalIncome) * 100 : null,
    budgetMonth,
    budgetMonthExpenses,
    budgetMonthTotal,
    budgetUsage: budgetMonthTotal ? (budgetMonthExpenses / budgetMonthTotal) * 100 : null,
    categoryShares: sortedCategories,
    chartMaximum: Math.max(1, ...summaries.flatMap((summary) => [
      number(summary.total_income),
      number(summary.total_expenses),
    ])),
  };
}
