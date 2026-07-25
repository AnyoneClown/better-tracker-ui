import { redirectToLoginForExpiredSession } from "@/lib/client-auth";

export type LogType =
  | "Expense"
  | "Income"
  | "Workout"
  | "Meal"
  | "Weight"
  | "Savings";

export type Activity = {
  id: string;
  kind: LogType;
  title: string;
  detail: string;
  value: string;
  tone: "green" | "orange" | "blue" | "purple" | "neutral";
  occurredAt: string;
};

export type Period = {
  key: string;
  label: string;
  year: number;
  month: number;
  startDate: string;
  endDate: string;
  referenceDate: string;
  isCurrent: boolean;
  daysRemaining: number;
};

export type BudgetCategory = {
  name: string;
  used: number;
  limit: number | null;
  color: "forest" | "lime" | "amber" | "slate";
};

export type SavingsGoal = {
  id: string;
  name: string;
  current: number;
  target: number;
  progress: number;
  currency: string;
};

export type NetWorthPoint = {
  id: string;
  recordedAt: string;
  value: number;
};

export type DashboardData = {
  period: Period;
  currency: string;
  finance: {
    spent: number;
    income: number;
    net: number;
    totalBudget: number;
    budgetRemaining: number;
    spentOnReferenceDate: number;
    categories: BudgetCategory[];
    transactionCount: number;
  };
  training: {
    monthCount: number;
    weekCount: number;
    totalDurationMinutes: number;
    totalVolumeKg: number;
    workoutDates: string[];
    latestWorkout: {
      name: string;
      durationMinutes: number | null;
      exerciseCount: number;
    } | null;
  };
  health: {
    calories: number;
    calorieTarget: number | null;
    protein: number;
    weight: number | null;
    weightChange: number | null;
    nutritionDate: string | null;
    weights: Array<{ date: string; value: number }>;
    nutritionDays: number;
  };
  wealth: {
    assets: number;
    liabilities: number;
    netWorth: number;
    savings: number;
    savedThisPeriod: number;
    change: number | null;
    changePercent: number | null;
    asOfLabel: string;
    points: NetWorthPoint[];
  };
  goals: SavingsGoal[];
  activities: Activity[];
  coverage: {
    score: number;
    tracked: string[];
    missing: string[];
  };
};

export type QuickLogInput = {
  type: LogType;
  description: string;
  date: string;
  value: number;
  duration?: number;
  protein?: number;
  calorieTarget?: number;
  category?: string;
  goalId?: string;
  newGoalName?: string;
  newGoalTarget?: number;
  currency: string;
};

export type UndoAction = {
  method: "DELETE" | "PATCH";
  path: string;
  body?: Record<string, unknown>;
};

type DecimalValue = string | number;

type Entity = {
  id: string;
  created_at: string;
  updated_at: string;
};

type ListResponse<T> = {
  items: T[];
  total: number;
  offset: number;
  limit: number;
};

type FinanceSummaryResponse = {
  year: number;
  month: number;
  currency: string;
  total_income: DecimalValue;
  total_expenses: DecimalValue;
  net: DecimalValue;
  total_budget: DecimalValue;
  budget_remaining: DecimalValue;
  categories: Array<{
    category: string;
    income: DecimalValue;
    expenses: DecimalValue;
    net: DecimalValue;
    budget: DecimalValue | null;
    budget_remaining: DecimalValue | null;
  }>;
};

type FinancialTransaction = Entity & {
  kind: "income" | "expense";
  amount: DecimalValue;
  category: string;
  occurred_on: string;
  currency: string;
  description: string | null;
  source: "manual" | "monobank";
  hold: boolean;
  excluded_from_summary: boolean;
};

type Workout = Entity & {
  name: string;
  performed_at: string;
  duration_minutes: number | null;
  notes: string | null;
  sets: Array<{
    exercise: string;
    set_number: number;
  }>;
};

type WorkoutSummary = {
  workout_count: number;
  total_duration_minutes: number;
  total_volume_kg: DecimalValue;
};

type WeightEntry = Entity & {
  recorded_on: string;
  weight_kg: DecimalValue;
  body_fat_percent: DecimalValue | null;
  notes: string | null;
};

type NutritionLog = Entity & {
  recorded_on: string;
  calories: number;
  calorie_target: number | null;
  protein_grams: DecimalValue | null;
  carbs_grams: DecimalValue | null;
  fat_grams: DecimalValue | null;
  notes: string | null;
};

type HealthSummary = {
  latest_weight_kg: DecimalValue | null;
  weight_change_kg: DecimalValue | null;
  nutrition_days_logged: number;
  average_calorie_target: DecimalValue | null;
};

type WealthSummary = {
  currency: string;
  assets: DecimalValue;
  liabilities: DecimalValue;
  net_worth: DecimalValue;
  savings: DecimalValue;
};

type SavingsGoalResponse = Entity & {
  name: string;
  target_amount: DecimalValue;
  current_amount: DecimalValue;
  currency: string;
  target_date: string | null;
  notes: string | null;
  progress_percent: DecimalValue;
};

type SavingsContribution = Entity & {
  goal_id: string;
  kind: "contribution" | "withdrawal";
  amount: DecimalValue;
  signed_amount: DecimalValue;
  occurred_on: string;
  notes: string | null;
};

type SavingsContributionMutation = {
  contribution: SavingsContribution;
  goal_current_amount: DecimalValue;
  goal_progress_percent: DecimalValue;
};

type NetWorthSnapshot = Entity & {
  recorded_at: string;
  assets: DecimalValue;
  liabilities: DecimalValue;
  net_worth: DecimalValue;
  currency: string;
  notes: string | null;
};

type ApiProblem = {
  detail?: string | Array<{ msg?: string }>;
};

const API_PREFIX = "/api/backend/api/v1";
const categoryColors: BudgetCategory["color"][] = [
  "forest",
  "lime",
  "amber",
  "slate",
];

export class TrackerApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "TrackerApiError";
  }
}

function numberFrom(value: DecimalValue | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function utcDateKey(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function queryString(values: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined) query.set(key, String(value));
  });
  return query.toString();
}

function problemMessage(payload: ApiProblem | null, fallback: string): string {
  if (typeof payload?.detail === "string") return payload.detail;
  if (Array.isArray(payload?.detail)) {
    const messages = payload.detail
      .map((item) => item.msg)
      .filter((item): item is string => Boolean(item));
    if (messages.length > 0) return messages.join("; ");
  }
  return fallback;
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(`${API_PREFIX}${path}`, {
      ...init,
      headers,
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new TrackerApiError(
      "Could not reach the Better Tracker API. Check the backend URL and service health.",
      0,
    );
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as ApiProblem | null;
    if (response.status === 401) redirectToLoginForExpiredSession();
    throw new TrackerApiError(
      response.status === 401
        ? "Your session expired. Please sign in again."
        : problemMessage(payload, `Backend request failed (${response.status})`),
      response.status,
    );
  }

  if (response.status === 204) return undefined as T;
  return await response.json() as T;
}

export function getPeriodOptions(count = 3, now = new Date()): Period[] {
  const options: Period[] = [];
  for (let offset = 0; offset < count; offset += 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    options.push(getPeriod(`${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`, now));
  }
  return options;
}

export function getPeriod(key: string, now = new Date()): Period {
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  const fallbackYear = now.getUTCFullYear();
  const fallbackMonth = now.getUTCMonth() + 1;
  const parsedYear = match ? Number(match[1]) : fallbackYear;
  const parsedMonth = match ? Number(match[2]) : fallbackMonth;
  const year = parsedMonth >= 1 && parsedMonth <= 12 ? parsedYear : fallbackYear;
  const month = parsedMonth >= 1 && parsedMonth <= 12 ? parsedMonth : fallbackMonth;
  const normalizedKey = `${year}-${pad(month)}`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const today = utcDateKey(now);
  const currentKey = today.slice(0, 7);
  const isCurrent = normalizedKey === currentKey;
  const endDate = `${normalizedKey}-${pad(lastDay)}`;

  return {
    key: normalizedKey,
    label: new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(year, month - 1, 1))),
    year,
    month,
    startDate: `${normalizedKey}-01`,
    endDate,
    referenceDate: isCurrent ? today : endDate,
    isCurrent,
    daysRemaining: isCurrent ? Math.max(lastDay - now.getUTCDate(), 0) : 0,
  };
}

function activityDate(date: string, period: Period): string {
  if (date === period.referenceDate && period.isCurrent) return "Today";
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

function dateOnlySortKey(date: string, createdAt: string): string {
  const time = createdAt.includes("T") ? createdAt.split("T")[1] : "12:00:00Z";
  return `${date}T${time}`;
}

function weekDateKeys(referenceDate: string): string[] {
  const reference = new Date(`${referenceDate}T12:00:00Z`);
  const mondayOffset = (reference.getUTCDay() + 6) % 7;
  const monday = new Date(reference);
  monday.setUTCDate(reference.getUTCDate() - mondayOffset);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setUTCDate(monday.getUTCDate() + index);
    return utcDateKey(date);
  });
}

function workoutExerciseCount(workout: Workout): number {
  return new Set(workout.sets.map((item) => item.exercise)).size;
}

export async function fetchDashboard(
  periodKey: string,
  signal?: AbortSignal,
): Promise<DashboardData> {
  const period = getPeriod(periodKey);
  const currency = "USD";
  const financeQuery = queryString({
    year: period.year,
    month: period.month,
    currency,
  });
  const dateQuery = queryString({
    start_date: period.startDate,
    end_date: period.endDate,
    limit: 100,
  });
  const workoutQuery = queryString({
    date_from: `${period.startDate}T00:00:00.000Z`,
    date_to: `${period.endDate}T23:59:59.999Z`,
    limit: 100,
  });
  const request = <T,>(path: string) => apiRequest<T>(path, { signal });

  const [
    finance,
    transactions,
    workoutSummary,
    workouts,
    healthSummary,
    weights,
    nutrition,
    wealth,
    goalList,
    snapshotList,
  ] = await Promise.all([
    request<FinanceSummaryResponse>(`/finance/summary?${financeQuery}`),
    request<ListResponse<FinancialTransaction>>(`/finance/transactions?${dateQuery}&currency=${currency}`),
    request<WorkoutSummary>(`/workouts/summary?${workoutQuery}`),
    request<ListResponse<Workout>>(`/workouts?${workoutQuery}`),
    request<HealthSummary>(`/health/summary?start_date=${period.startDate}&end_date=${period.endDate}`),
    request<ListResponse<WeightEntry>>(`/health/weights?${dateQuery}`),
    request<ListResponse<NutritionLog>>(`/health/nutrition?${dateQuery}`),
    request<WealthSummary>(`/wealth/summary?currency=${currency}`),
    request<ListResponse<SavingsGoalResponse>>(`/wealth/savings-goals?currency=${currency}&limit=100`),
    request<ListResponse<NetWorthSnapshot>>(`/wealth/net-worth-snapshots?currency=${currency}&limit=100`),
  ]);

  const contributionPages = await Promise.all(
    goalList.items.map((goal) => request<ListResponse<SavingsContribution>>(
      `/wealth/savings-goals/${goal.id}/contributions?${dateQuery}`,
    )),
  );
  const contributions = contributionPages.flatMap((page) => page.items);
  const includedTransactions = transactions.items.filter(
    (item) => !item.hold && !item.excluded_from_summary,
  );

  const categories = finance.categories
    .filter((category) => numberFrom(category.expenses) > 0 || category.budget !== null)
    .map((category, index): BudgetCategory => ({
      name: titleCase(category.category),
      used: numberFrom(category.expenses),
      limit: category.budget === null ? null : numberFrom(category.budget),
      color: categoryColors[index % categoryColors.length],
    }))
    .sort((left, right) => {
      if (left.limit !== null && right.limit === null) return -1;
      if (left.limit === null && right.limit !== null) return 1;
      return right.used - left.used;
    });

  const referenceNutrition = period.isCurrent
    ? nutrition.items.find((item) => item.recorded_on === period.referenceDate) ?? null
    : nutrition.items[0] ?? null;
  const nutritionTarget = referenceNutrition?.calorie_target
    ?? (healthSummary.average_calorie_target === null
      ? null
      : Math.round(numberFrom(healthSummary.average_calorie_target)));
  const weightSeries = weights.items
    .map((item) => ({ date: item.recorded_on, value: numberFrom(item.weight_kg) }))
    .sort((left, right) => left.date.localeCompare(right.date));

  const weekKeys = new Set(weekDateKeys(period.referenceDate));
  const workoutDates = workouts.items.map((item) => item.performed_at.slice(0, 10));
  const weekCount = workoutDates.filter((date) => weekKeys.has(date)).length;

  const sortedSnapshots = snapshotList.items
    .slice()
    .sort((left, right) => left.recorded_at.localeCompare(right.recorded_at));
  const periodEnd = Date.parse(`${period.endDate}T23:59:59.999Z`);
  const eligibleSnapshots = period.isCurrent
    ? sortedSnapshots
    : sortedSnapshots.filter((item) => Date.parse(item.recorded_at) <= periodEnd);
  const selectedSnapshot = period.isCurrent
    ? null
    : eligibleSnapshots.at(-1) ?? null;
  const displayAssets = selectedSnapshot ? numberFrom(selectedSnapshot.assets) : numberFrom(wealth.assets);
  const displayLiabilities = selectedSnapshot
    ? numberFrom(selectedSnapshot.liabilities)
    : numberFrom(wealth.liabilities);
  const displayNetWorth = selectedSnapshot
    ? numberFrom(selectedSnapshot.net_worth)
    : numberFrom(wealth.net_worth);

  let points: NetWorthPoint[] = eligibleSnapshots.map((item) => ({
    id: item.id,
    recordedAt: item.recorded_at,
    value: numberFrom(item.net_worth),
  }));
  const latestSnapshotPoint = points.at(-1);
  if (
    period.isCurrent
    && (!latestSnapshotPoint || latestSnapshotPoint.value !== displayNetWorth)
  ) {
    points.push({
      id: "current-balances",
      recordedAt: new Date().toISOString(),
      value: displayNetWorth,
    });
  }
  points = points.slice(-12);
  const latestPoint = points.at(-1);
  const priorPoint = points.at(-2);
  const wealthChange = latestPoint && priorPoint
    ? latestPoint.value - priorPoint.value
    : null;
  const wealthChangePercent = wealthChange !== null && priorPoint && priorPoint.value !== 0
    ? (wealthChange / Math.abs(priorPoint.value)) * 100
    : null;

  const goals: SavingsGoal[] = goalList.items.map((goal) => ({
    id: goal.id,
    name: goal.name,
    current: numberFrom(goal.current_amount),
    target: numberFrom(goal.target_amount),
    progress: numberFrom(goal.progress_percent),
    currency: goal.currency,
  }));
  const goalNames = new Map(goals.map((goal) => [goal.id, goal.name]));

  const activities: Activity[] = [
    ...transactions.items.map((item): Activity => ({
      id: `transaction-${item.id}`,
      kind: item.kind === "expense" ? "Expense" : "Income",
      title: item.description || titleCase(item.category),
      detail: `${titleCase(item.category)} · ${activityDate(item.occurred_on, period)}${item.hold ? " · Pending" : item.excluded_from_summary ? " · Excluded" : ""}`,
      value: `${item.kind === "expense" ? "−" : "+"}${formatMoney(numberFrom(item.amount), item.currency)}`,
      tone: item.kind === "expense" ? "orange" : "green",
      occurredAt: dateOnlySortKey(item.occurred_on, item.created_at),
    })),
    ...workouts.items.map((item): Activity => ({
      id: `workout-${item.id}`,
      kind: "Workout",
      title: item.name,
      detail: `${item.duration_minutes ?? 0} min · ${activityDate(item.performed_at.slice(0, 10), period)}`,
      value: workoutExerciseCount(item) > 0
        ? `${workoutExerciseCount(item)} exercises`
        : "Completed",
      tone: "purple",
      occurredAt: item.performed_at,
    })),
    ...nutrition.items.map((item): Activity => ({
      id: `nutrition-${item.id}`,
      kind: "Meal",
      title: item.notes || "Daily nutrition",
      detail: `Nutrition · ${activityDate(item.recorded_on, period)}`,
      value: `${item.calories.toLocaleString()} kcal`,
      tone: "green",
      occurredAt: dateOnlySortKey(item.recorded_on, item.created_at),
    })),
    ...weights.items.map((item): Activity => ({
      id: `weight-${item.id}`,
      kind: "Weight",
      title: item.notes || "Weight check-in",
      detail: `Body · ${activityDate(item.recorded_on, period)}`,
      value: `${numberFrom(item.weight_kg).toFixed(1)} kg`,
      tone: "blue",
      occurredAt: dateOnlySortKey(item.recorded_on, item.created_at),
    })),
    ...contributions.map((item): Activity => ({
      id: `savings-${item.id}`,
      kind: "Savings",
      title: goalNames.get(item.goal_id) ?? "Savings goal",
      detail: `Savings · ${activityDate(item.occurred_on, period)}`,
      value: `${item.kind === "withdrawal" ? "−" : "+"}${formatMoney(numberFrom(item.amount), currency)}`,
      tone: item.kind === "withdrawal" ? "orange" : "green",
      occurredAt: dateOnlySortKey(item.occurred_on, item.created_at),
    })),
  ]
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
    .slice(0, 7);

  const savedThisPeriod = contributions.reduce(
    (total, item) => total + numberFrom(item.signed_amount),
    0,
  );
  const coverageEntries = [
    ["Money", transactions.total > 0],
    ["Training", workouts.total > 0],
    ["Nutrition", nutrition.total > 0],
    ["Body", weights.total > 0],
    ["Savings", contributions.length > 0],
  ] as const;
  const tracked = coverageEntries.filter(([, value]) => value).map(([name]) => name);
  const missing = coverageEntries.filter(([, value]) => !value).map(([name]) => name);

  return {
    period,
    currency: finance.currency,
    finance: {
      spent: numberFrom(finance.total_expenses),
      income: numberFrom(finance.total_income),
      net: numberFrom(finance.net),
      totalBudget: numberFrom(finance.total_budget),
      budgetRemaining: numberFrom(finance.budget_remaining),
      spentOnReferenceDate: includedTransactions
        .filter((item) => item.kind === "expense" && item.occurred_on === period.referenceDate)
        .reduce((total, item) => total + numberFrom(item.amount), 0),
      categories,
      transactionCount: includedTransactions.length,
    },
    training: {
      monthCount: workoutSummary.workout_count,
      weekCount,
      totalDurationMinutes: workoutSummary.total_duration_minutes,
      totalVolumeKg: numberFrom(workoutSummary.total_volume_kg),
      workoutDates,
      latestWorkout: workouts.items[0]
        ? {
          name: workouts.items[0].name,
          durationMinutes: workouts.items[0].duration_minutes,
          exerciseCount: workoutExerciseCount(workouts.items[0]),
        }
        : null,
    },
    health: {
      calories: referenceNutrition?.calories ?? 0,
      calorieTarget: nutritionTarget,
      protein: numberFrom(referenceNutrition?.protein_grams),
      weight: healthSummary.latest_weight_kg === null
        ? null
        : numberFrom(healthSummary.latest_weight_kg),
      weightChange: healthSummary.weight_change_kg === null
        ? null
        : numberFrom(healthSummary.weight_change_kg),
      nutritionDate: referenceNutrition?.recorded_on ?? null,
      weights: weightSeries,
      nutritionDays: healthSummary.nutrition_days_logged,
    },
    wealth: {
      assets: displayAssets,
      liabilities: displayLiabilities,
      netWorth: displayNetWorth,
      savings: numberFrom(wealth.savings),
      savedThisPeriod,
      change: wealthChange,
      changePercent: wealthChangePercent,
      asOfLabel: selectedSnapshot
        ? `Snapshot ${activityDate(selectedSnapshot.recorded_at.slice(0, 10), period)}`
        : period.isCurrent
          ? "Current account balances"
          : "Current balances · no period snapshot",
      points,
    },
    goals,
    activities,
    coverage: {
      score: Math.round((tracked.length / coverageEntries.length) * 100),
      tracked,
      missing,
    },
  };
}

function jsonBody(value: Record<string, unknown>): string {
  return JSON.stringify(value);
}

function appendNote(previous: string | null, next: string): string {
  const combined = previous ? `${previous}; ${next}` : next;
  return combined.slice(0, 500);
}

function eventTimestamp(date: string): string {
  const now = new Date();
  if (date === utcDateKey(now)) return now.toISOString();
  return `${date}T12:00:00.000Z`;
}

export async function createQuickLog(input: QuickLogInput): Promise<UndoAction> {
  if (input.type === "Expense" || input.type === "Income") {
    const created = await apiRequest<FinancialTransaction>("/finance/transactions", {
      method: "POST",
      body: jsonBody({
        kind: input.type.toLowerCase(),
        amount: input.value,
        category: input.type === "Expense" ? input.category || "general" : "income",
        occurred_on: input.date,
        currency: input.currency,
        description: input.description,
      }),
    });
    return { method: "DELETE", path: `/finance/transactions/${created.id}` };
  }

  if (input.type === "Workout") {
    const created = await apiRequest<Workout>("/workouts", {
      method: "POST",
      body: jsonBody({
        name: input.description,
        performed_at: eventTimestamp(input.date),
        duration_minutes: input.duration,
        notes: null,
        sets: [],
      }),
    });
    return { method: "DELETE", path: `/workouts/${created.id}` };
  }

  if (input.type === "Meal") {
    const existing = await apiRequest<ListResponse<NutritionLog>>(
      `/health/nutrition?start_date=${input.date}&end_date=${input.date}&limit=1`,
    );
    const previous = existing.items[0];
    if (previous) {
      const previousBody = {
        recorded_on: previous.recorded_on,
        calories: previous.calories,
        calorie_target: previous.calorie_target,
        protein_grams: previous.protein_grams,
        carbs_grams: previous.carbs_grams,
        fat_grams: previous.fat_grams,
        notes: previous.notes,
      };
      const patchBody: Record<string, unknown> = {
        calories: previous.calories + Math.round(input.value),
        protein_grams: numberFrom(previous.protein_grams) + (input.protein ?? 0),
        notes: appendNote(previous.notes, input.description),
      };
      if (input.calorieTarget !== undefined) {
        patchBody.calorie_target = input.calorieTarget;
      }
      await apiRequest<NutritionLog>(`/health/nutrition/${previous.id}`, {
        method: "PATCH",
        body: jsonBody(patchBody),
      });
      return {
        method: "PATCH",
        path: `/health/nutrition/${previous.id}`,
        body: previousBody,
      };
    }

    const created = await apiRequest<NutritionLog>("/health/nutrition", {
      method: "POST",
      body: jsonBody({
        recorded_on: input.date,
        calories: Math.round(input.value),
        calorie_target: input.calorieTarget ?? null,
        protein_grams: input.protein ?? 0,
        notes: input.description,
      }),
    });
    return { method: "DELETE", path: `/health/nutrition/${created.id}` };
  }

  if (input.type === "Weight") {
    const existing = await apiRequest<ListResponse<WeightEntry>>(
      `/health/weights?start_date=${input.date}&end_date=${input.date}&limit=1`,
    );
    const previous = existing.items[0];
    if (previous) {
      await apiRequest<WeightEntry>(`/health/weights/${previous.id}`, {
        method: "PATCH",
        body: jsonBody({
          weight_kg: input.value,
          notes: input.description || null,
        }),
      });
      return {
        method: "PATCH",
        path: `/health/weights/${previous.id}`,
        body: {
          recorded_on: previous.recorded_on,
          weight_kg: previous.weight_kg,
          body_fat_percent: previous.body_fat_percent,
          notes: previous.notes,
        },
      };
    }

    const created = await apiRequest<WeightEntry>("/health/weights", {
      method: "POST",
      body: jsonBody({
        recorded_on: input.date,
        weight_kg: input.value,
        notes: input.description || null,
      }),
    });
    return { method: "DELETE", path: `/health/weights/${created.id}` };
  }

  let goalId = input.goalId;
  let createdGoal: SavingsGoalResponse | null = null;
  if (!goalId) {
    if (!input.newGoalName || !input.newGoalTarget) {
      throw new TrackerApiError("Choose a savings goal or create one first.", 422);
    }
    createdGoal = await apiRequest<SavingsGoalResponse>("/wealth/savings-goals", {
      method: "POST",
      body: jsonBody({
        name: input.newGoalName,
        target_amount: input.newGoalTarget,
        current_amount: 0,
        currency: input.currency,
      }),
    });
    goalId = createdGoal.id;
  }

  try {
    const result = await apiRequest<SavingsContributionMutation>(
      `/wealth/savings-goals/${goalId}/contributions`,
      {
        method: "POST",
        body: jsonBody({
          kind: "contribution",
          amount: input.value,
          occurred_on: input.date,
          notes: null,
        }),
      },
    );
    return createdGoal
      ? { method: "DELETE", path: `/wealth/savings-goals/${createdGoal.id}` }
      : {
        method: "DELETE",
        path: `/wealth/savings-contributions/${result.contribution.id}`,
      };
  } catch (error) {
    if (createdGoal) {
      await apiRequest<void>(`/wealth/savings-goals/${createdGoal.id}`, {
        method: "DELETE",
      }).catch(() => undefined);
    }
    throw error;
  }
}

export async function undoQuickLog(action: UndoAction): Promise<void> {
  await apiRequest<void>(action.path, {
    method: action.method,
    body: action.body ? jsonBody(action.body) : undefined,
  });
}

export function formatMoney(value: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}
