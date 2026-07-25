import { apiRequest, getPeriod, type Period } from "@/lib/tracker-api";

export type DecimalValue = string | number;

export type Entity = {
  id: string;
  created_at: string;
  updated_at: string;
};

export type ListResponse<T> = {
  items: T[];
  total: number;
  offset: number;
  limit: number;
};

export type FinanceCategorySummary = {
  category: string;
  income: DecimalValue;
  expenses: DecimalValue;
  net: DecimalValue;
  budget: DecimalValue | null;
  budget_remaining: DecimalValue | null;
};

export type FinanceSummary = {
  year: number;
  month: number;
  currency: string;
  total_income: DecimalValue;
  total_expenses: DecimalValue;
  net: DecimalValue;
  total_budget: DecimalValue;
  budget_remaining: DecimalValue;
  categories: FinanceCategorySummary[];
};

export type FinancialTransaction = Entity & {
  kind: "income" | "expense";
  amount: DecimalValue;
  category: string;
  occurred_on: string;
  currency: string;
  description: string | null;
  source: "manual" | "monobank" | "privatbank";
  external_account_id: string | null;
  external_transaction_id: string | null;
  occurred_at: string | null;
  mcc: number | null;
  hold: boolean;
  mapped_category: string | null;
  category_override: string | null;
  excluded_from_summary: boolean;
  provider_metadata: Record<string, unknown> | null;
};

export type MonthlyBudget = Entity & {
  year: number;
  month: number;
  category: string;
  currency: string;
  limit_amount: DecimalValue;
};

export type FinancialAccount = Entity & {
  name: string;
  account_type: "asset" | "liability";
  category: string;
  balance: DecimalValue;
  currency: string;
  include_in_net_worth: boolean;
  is_savings: boolean;
};

export type SavingsGoal = Entity & {
  name: string;
  target_amount: DecimalValue;
  current_amount: DecimalValue;
  currency: string;
  target_date: string | null;
  notes: string | null;
  progress_percent: DecimalValue;
};

export type SavingsContribution = Entity & {
  goal_id: string;
  kind: "contribution" | "withdrawal";
  amount: DecimalValue;
  signed_amount: DecimalValue;
  occurred_on: string;
  notes: string | null;
};

export type NetWorthSnapshot = Entity & {
  recorded_at: string;
  assets: DecimalValue;
  liabilities: DecimalValue;
  net_worth: DecimalValue;
  currency: string;
  notes: string | null;
};

export type WealthSummary = {
  currency: string;
  assets: DecimalValue;
  liabilities: DecimalValue;
  net_worth: DecimalValue;
  savings: DecimalValue;
  savings_goal_target: DecimalValue;
  savings_goal_current: DecimalValue;
};

export type MonobankAccount = Entity & {
  external_id: string;
  send_id: string | null;
  card_type: string;
  balance: DecimalValue;
  credit_limit: DecimalValue;
  currency: string;
  masked_pan: string[];
  iban: string | null;
  cashback_type: string | null;
};

export type MonobankJar = Entity & {
  external_id: string;
  send_id: string | null;
  title: string;
  description: string | null;
  balance: DecimalValue;
  goal: DecimalValue | null;
  currency: string;
  progress_percent: DecimalValue | null;
};

export type MonobankConnection = {
  connected: boolean;
  id: string | null;
  external_client_id: string | null;
  client_name: string | null;
  permissions: string | null;
  client_metadata: Record<string, unknown> | null;
  sync_status: "idle" | "running" | "succeeded" | "failed" | null;
  sync_progress_current: number;
  sync_progress_total: number;
  sync_error: string | null;
  sync_date_from: string | null;
  sync_date_to: string | null;
  connected_at: string | null;
  last_sync_started_at: string | null;
  last_sync_completed_at: string | null;
  accounts: MonobankAccount[];
  jars: MonobankJar[];
};

export type MonobankSyncAccepted = {
  status: "running";
  sync_progress_current: number;
  sync_progress_total: number;
  date_from: string;
  date_to: string;
};

export type MonobankTransactionsDeleteResponse = {
  account_id: string;
  deleted_count: number;
};

export type PrivatBankAccount = Entity & {
  external_id: string;
  masked_iban: string;
  name: string;
  balance: DecimalValue;
  currency: string;
  last_movement_at: string | null;
};

export type PrivatBankConnection = {
  connected: boolean;
  id: string | null;
  client_name: string | null;
  server_metadata: Record<string, unknown> | null;
  sync_status: "idle" | "running" | "succeeded" | "failed" | null;
  sync_progress_current: number;
  sync_progress_total: number;
  sync_error: string | null;
  sync_date_from: string | null;
  sync_date_to: string | null;
  connected_at: string | null;
  last_sync_started_at: string | null;
  last_sync_completed_at: string | null;
  accounts: PrivatBankAccount[];
};

export type PrivatBankSyncAccepted = {
  status: "running";
  sync_progress_current: number;
  sync_progress_total: number;
  date_from: string;
  date_to: string;
};

export type PrivatBankTransactionsDeleteResponse = {
  account_id: string;
  deleted_count: number;
};

export type WorkoutSet = Entity & {
  workout_id: string;
  exercise: string;
  set_number: number;
  reps: number | null;
  weight_kg: DecimalValue | null;
  distance_km: DecimalValue | null;
  duration_seconds: number | null;
  notes: string | null;
};

export type Workout = Entity & {
  name: string;
  performed_at: string;
  duration_minutes: number | null;
  notes: string | null;
  sets: WorkoutSet[];
};

export type WorkoutExerciseSummary = {
  exercise: string;
  sets: number;
  total_reps: number;
  volume_kg: DecimalValue;
  distance_km: DecimalValue;
  duration_seconds: number;
};

export type WorkoutSummary = {
  date_from: string | null;
  date_to: string | null;
  workout_count: number;
  total_duration_minutes: number;
  average_duration_minutes: DecimalValue | null;
  total_sets: number;
  total_reps: number;
  total_volume_kg: DecimalValue;
  total_distance_km: DecimalValue;
  total_set_duration_seconds: number;
  exercises: WorkoutExerciseSummary[];
};

export type NutritionLog = Entity & {
  recorded_on: string;
  calories: number;
  calorie_target: number | null;
  protein_grams: DecimalValue | null;
  carbs_grams: DecimalValue | null;
  fat_grams: DecimalValue | null;
  notes: string | null;
};

export type WeightEntry = Entity & {
  recorded_on: string;
  weight_kg: DecimalValue;
  body_fat_percent: DecimalValue | null;
  notes: string | null;
};

export type HealthSummary = {
  start_date: string | null;
  end_date: string | null;
  latest_weight_kg: DecimalValue | null;
  weight_change_kg: DecimalValue | null;
  nutrition_days_logged: number;
  total_calories: number;
  average_daily_calories: DecimalValue | null;
  average_calorie_target: DecimalValue | null;
};

export type MoneyData = {
  period: Period;
  finance: FinanceSummary;
  transactions: FinancialTransaction[];
  budgets: MonthlyBudget[];
  wealth: WealthSummary;
  accounts: FinancialAccount[];
  goals: SavingsGoal[];
  contributions: SavingsContribution[];
  snapshots: NetWorthSnapshot[];
  currencies: string[];
  monobank: MonobankConnection;
  privatbank: PrivatBankConnection;
};

export type TrainingData = {
  period: Period;
  summary: WorkoutSummary;
  workouts: Workout[];
};

export type NutritionData = {
  period: Period;
  summary: HealthSummary;
  logs: NutritionLog[];
};

export type BodyData = {
  period: Period;
  summary: HealthSummary;
  entries: WeightEntry[];
};

export function asNumber(value: DecimalValue | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function apiDate(value: string): string {
  return value.slice(0, 10);
}

function query(values: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined) search.set(key, String(value));
  });
  return search.toString();
}

function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  return apiRequest<T>(path, { signal });
}

export async function fetchMoneyData(
  periodKey: string,
  currency: string,
  signal?: AbortSignal,
): Promise<MoneyData> {
  const period = getPeriod(periodKey);
  const dateQuery = query({ start_date: period.startDate, end_date: period.endDate, limit: 100 });
  const [finance, transactions, budgets, wealth, accounts, goals, snapshots, currencies, monobank, privatbank] = await Promise.all([
    request<FinanceSummary>(`/finance/summary?${query({ year: period.year, month: period.month, currency })}`, signal),
    request<ListResponse<FinancialTransaction>>(`/finance/transactions?${dateQuery}&currency=${currency}`, signal),
    request<ListResponse<MonthlyBudget>>(`/finance/budgets?${query({ year: period.year, month: period.month, currency, limit: 100 })}`, signal),
    request<WealthSummary>(`/wealth/summary?currency=${currency}`, signal),
    request<ListResponse<FinancialAccount>>(`/wealth/accounts?currency=${currency}&limit=100`, signal),
    request<ListResponse<SavingsGoal>>(`/wealth/savings-goals?currency=${currency}&limit=100`, signal),
    request<ListResponse<NetWorthSnapshot>>(`/wealth/net-worth-snapshots?currency=${currency}&limit=100`, signal),
    request<string[]>("/finance/currencies", signal),
    request<MonobankConnection>("/integrations/monobank/connection", signal),
    request<PrivatBankConnection>("/integrations/privatbank/connection", signal),
  ]);
  const contributionPages = await Promise.all(goals.items.map((goal) => request<ListResponse<SavingsContribution>>(
    `/wealth/savings-goals/${goal.id}/contributions?${dateQuery}`,
    signal,
  )));
  return {
    period,
    finance,
    transactions: transactions.items,
    budgets: budgets.items,
    wealth,
    accounts: accounts.items,
    goals: goals.items,
    contributions: contributionPages.flatMap((page) => page.items),
    snapshots: snapshots.items,
    currencies,
    monobank,
    privatbank,
  };
}

export async function connectMonobank(token: string): Promise<MonobankConnection> {
  return apiRequest<MonobankConnection>("/integrations/monobank/connection", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export async function startMonobankSync(
  dateFrom: string,
  dateTo: string,
): Promise<MonobankSyncAccepted> {
  return apiRequest<MonobankSyncAccepted>("/integrations/monobank/sync", {
    method: "POST",
    body: JSON.stringify({ date_from: dateFrom, date_to: dateTo }),
  });
}

export async function deleteMonobankAccountTransactions(
  accountId: string,
): Promise<MonobankTransactionsDeleteResponse> {
  return apiRequest<MonobankTransactionsDeleteResponse>(
    `/integrations/monobank/accounts/${accountId}/transactions`,
    { method: "DELETE" },
  );
}

export async function disconnectMonobank(): Promise<void> {
  await apiRequest("/integrations/monobank/connection", { method: "DELETE" });
}

export async function connectPrivatBank(token: string): Promise<PrivatBankConnection> {
  return apiRequest<PrivatBankConnection>("/integrations/privatbank/connection", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export async function startPrivatBankSync(
  dateFrom: string,
  dateTo: string,
): Promise<PrivatBankSyncAccepted> {
  return apiRequest<PrivatBankSyncAccepted>("/integrations/privatbank/sync", {
    method: "POST",
    body: JSON.stringify({ date_from: dateFrom, date_to: dateTo }),
  });
}

export async function deletePrivatBankAccountTransactions(
  accountId: string,
): Promise<PrivatBankTransactionsDeleteResponse> {
  return apiRequest<PrivatBankTransactionsDeleteResponse>(
    `/integrations/privatbank/accounts/${accountId}/transactions`,
    { method: "DELETE" },
  );
}

export async function disconnectPrivatBank(): Promise<void> {
  await apiRequest("/integrations/privatbank/connection", { method: "DELETE" });
}

export async function fetchTrainingData(periodKey: string, signal?: AbortSignal): Promise<TrainingData> {
  const period = getPeriod(periodKey);
  const range = query({
    date_from: `${period.startDate}T00:00:00.000Z`,
    date_to: `${period.endDate}T23:59:59.999Z`,
  });
  const [summary, workouts] = await Promise.all([
    request<WorkoutSummary>(`/workouts/summary?${range}`, signal),
    request<ListResponse<Workout>>(`/workouts?${range}&limit=100`, signal),
  ]);
  return { period, summary, workouts: workouts.items };
}

export async function fetchNutritionData(periodKey: string, signal?: AbortSignal): Promise<NutritionData> {
  const period = getPeriod(periodKey);
  const dateQuery = query({ start_date: period.startDate, end_date: period.endDate });
  const [summary, logs] = await Promise.all([
    request<HealthSummary>(`/health/summary?${dateQuery}`, signal),
    request<ListResponse<NutritionLog>>(`/health/nutrition?${dateQuery}&limit=100`, signal),
  ]);
  return { period, summary, logs: logs.items };
}

export async function fetchBodyData(periodKey: string, signal?: AbortSignal): Promise<BodyData> {
  const period = getPeriod(periodKey);
  const dateQuery = query({ start_date: period.startDate, end_date: period.endDate });
  const [summary, entries] = await Promise.all([
    request<HealthSummary>(`/health/summary?${dateQuery}`, signal),
    request<ListResponse<WeightEntry>>(`/health/weights?${dateQuery}&limit=100`, signal),
  ]);
  return { period, summary, entries: entries.items };
}

export async function createRecord<T>(path: string, body: Record<string, unknown>): Promise<T> {
  return apiRequest<T>(path, { method: "POST", body: JSON.stringify(body) });
}

export async function updateRecord<T>(path: string, body: Record<string, unknown>): Promise<T> {
  return apiRequest<T>(path, { method: "PATCH", body: JSON.stringify(body) });
}

export async function deleteRecord(path: string): Promise<void> {
  return apiRequest<void>(path, { method: "DELETE" });
}
