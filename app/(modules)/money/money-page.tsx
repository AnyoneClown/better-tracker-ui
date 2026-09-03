"use client";

import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  Camera,
  CircleAlert,
  CircleDollarSign,
  CloudDownload,
  CreditCard,
  Edit3,
  Landmark,
  Link2,
  Minus,
  PiggyBank,
  Plus,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  Target,
  Trash2,
  TrendingUp,
  Unplug,
  WalletCards,
} from "lucide-react";
import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DataNotice, EmptyState, ModuleDialog, ModuleHeader, ModuleState, ModuleToast, SaveActions } from "@/components/module-ui";
import { useModuleData } from "@/hooks/use-module-data";
import {
  asNumber,
  connectMonobank,
  createRecord,
  deleteAllTransactions,
  deleteMonobankAccountTransactions,
  deleteRecord,
  disconnectMonobank,
  fetchMonobankConnection,
  fetchMoneyData,
  fetchMoneyTrackingSummary,
  fetchMoneyTransactionSummary,
  type FinancialAccount,
  type FinancialTransaction,
  type MonobankAccount,
  type MoneyData,
  type MonthlyBudget,
  type NetWorthSnapshot,
  type SavingsContribution,
  type SavingsGoal,
  startMonobankSync,
  updateMonobankAccountTracking,
  updateRecord,
} from "@/lib/module-api";
import { formatMoney, getPeriod } from "@/lib/tracker-api";

type Toast = { message: string; tone: "success" | "error" };
type MoneyDialog =
  | { kind: "transaction"; record?: FinancialTransaction }
  | { kind: "budget"; record?: MonthlyBudget }
  | { kind: "account"; record?: FinancialAccount }
  | { kind: "goal"; record?: SavingsGoal }
  | { kind: "contribution"; goal: SavingsGoal; record?: SavingsContribution }
  | { kind: "monobank-connect" };

function shortDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${date.slice(0, 10)}T12:00:00Z`));
}

function titleCase(value: string): string {
  return value.split(/\s+/).filter(Boolean).map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");
}

function dateTime(value: string | null): string {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function kyivDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function shiftDate(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function updateMonobankTrackingLocally(
  current: MoneyData,
  accountId: string,
  isTracked: boolean,
): MoneyData {
  const account = current.monobank.accounts.find((item) => item.id === accountId);
  if (!account || account.is_tracked === isTracked) return current;

  const balance = asNumber(account.balance);
  const direction = isTracked ? 1 : -1;
  const affectsSelectedCurrency = account.currency === current.wealth.currency;
  const assets = affectsSelectedCurrency && balance > 0
    ? Math.max(0, asNumber(current.wealth.assets) + direction * balance)
    : asNumber(current.wealth.assets);
  const liabilities = affectsSelectedCurrency && balance < 0
    ? Math.max(0, asNumber(current.wealth.liabilities) + direction * Math.abs(balance))
    : asNumber(current.wealth.liabilities);
  const currencies = isTracked && !current.currencies.includes(account.currency)
    ? [...current.currencies, account.currency].sort((left, right) => (
      left === "UAH" ? -1 : right === "UAH" ? 1 : left.localeCompare(right)
    ))
    : current.currencies;

  return {
    ...current,
    wealth: affectsSelectedCurrency
      ? { ...current.wealth, assets, liabilities, net_worth: assets - liabilities }
      : current.wealth,
    currencies,
    monobank: {
      ...current.monobank,
      accounts: current.monobank.accounts.map((item) => (
        item.id === accountId ? { ...item, is_tracked: isTracked } : item
      )),
    },
  };
}

export default function MoneyPage({ initialPeriodKey }: { initialPeriodKey: string }) {
  const [periodKey, setPeriodKey] = useState(initialPeriodKey);
  const [selectedCurrency, setSelectedCurrency] = useState("UAH");
  const [monobankSyncDateTo, setMonobankSyncDateTo] = useState(() => kyivDate());
  const [monobankSyncDateFrom, setMonobankSyncDateFrom] = useState(() => shiftDate(kyivDate(), -30));
  const moneyLoader = useCallback((requestKey: string, signal?: AbortSignal) => {
    const [requestedPeriod, requestedCurrency] = requestKey.split("|");
    return fetchMoneyData(requestedPeriod, requestedCurrency, signal);
  }, []);
  const moneyViewKey = `${periodKey}|${selectedCurrency}`;
  const { data, loading, error, refresh, updateData } = useModuleData(moneyViewKey, moneyLoader);
  const [tab, setTab] = useState<"cashflow" | "wealth">("cashflow");
  const [dialog, setDialog] = useState<MoneyDialog | null>(null);
  const [saving, setSaving] = useState(false);
  const [integrationBusy, setIntegrationBusy] = useState(false);
  const [monobankTrackingAccountIds, setMonobankTrackingAccountIds] = useState<Set<string>>(() => new Set());
  const [transactionDeleteTarget, setTransactionDeleteTarget] = useState<string | null>(null);
  const [monobankSyncAwaitingRefresh, setMonobankSyncAwaitingRefresh] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const previousMonobankSyncStatus = useRef<"idle" | "running" | "succeeded" | "failed" | null>(null);
  const monobankSyncBaseline = useRef<string | null>(null);
  const monobankTrackingRequestCount = useRef(0);
  const monobankTrackingRevision = useRef(0);
  const transactionDeleteBusy = useRef(false);
  const activeMoneyViewKey = useRef(moneyViewKey);
  const today = kyivDate();
  const period = data?.period ?? getPeriod(periodKey, new Date(`${initialPeriodKey}-15T12:00:00Z`));
  const currency = data?.finance.currency ?? selectedCurrency;
  const money = useCallback((value: number) => formatMoney(value, currency), [currency]);
  const closeDialog = useCallback(() => setDialog(null), []);
  const goalsById = useMemo(() => new Map(data?.goals.map((goal) => [goal.id, goal.name]) ?? []), [data?.goals]);
  const currencies = useMemo(() => {
    const values = new Set(["UAH", selectedCurrency, ...(data?.currencies ?? [])]);
    return Array.from(values).sort((left, right) => left === "UAH" ? -1 : right === "UAH" ? 1 : left.localeCompare(right));
  }, [data?.currencies, selectedCurrency]);
  const trackedMonobankAccountCount = data?.monobank.accounts.filter((account) => account.is_tracked).length ?? 0;
  const monobankTrackingBusy = monobankTrackingAccountIds.size > 0;

  const shouldPollMonobank = data?.monobank.sync_status === "running" || monobankSyncAwaitingRefresh;

  useEffect(() => {
    activeMoneyViewKey.current = moneyViewKey;
  }, [moneyViewKey]);

  useEffect(() => {
    if (!shouldPollMonobank) return;
    const controller = new AbortController();
    let requestRunning = false;

    const pollConnections = async () => {
      if (requestRunning) return;
      requestRunning = true;
      try {
        const monobank = await fetchMonobankConnection(controller.signal);
        if (controller.signal.aborted) return;
        updateData((current) => ({
          ...current,
          monobank,
        }));
      } catch (reason) {
        if (
          !controller.signal.aborted
          && !(reason instanceof DOMException && reason.name === "AbortError")
        ) {
          console.warn("[money-sync-poll] Connection status refresh failed", reason);
        }
      } finally {
        requestRunning = false;
      }
    };

    const pollAfterResume = () => {
      if (document.visibilityState === "visible") void pollConnections();
    };

    void pollConnections();
    const timer = window.setInterval(() => void pollConnections(), 2500);
    window.addEventListener("focus", pollAfterResume);
    document.addEventListener("visibilitychange", pollAfterResume);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", pollAfterResume);
      document.removeEventListener("visibilitychange", pollAfterResume);
    };
  }, [shouldPollMonobank, updateData]);

  useEffect(() => {
    const currentStatus = data?.monobank.sync_status ?? null;
    const previousStatus = previousMonobankSyncStatus.current;
    previousMonobankSyncStatus.current = currentStatus;
    const observedNewSync = monobankSyncAwaitingRefresh
      && data?.monobank.last_sync_started_at !== monobankSyncBaseline.current;
    if (currentStatus === "running") return;
    if (previousStatus !== "running" && !observedNewSync) return;
    const timer = window.setTimeout(() => {
      monobankSyncBaseline.current = data?.monobank.last_sync_started_at ?? null;
      setMonobankSyncAwaitingRefresh(false);
      refresh();
      if (currentStatus === "succeeded") {
        setToast({ message: "Monobank sync complete. Money data refreshed.", tone: "success" });
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [
    data?.monobank.last_sync_started_at,
    data?.monobank.sync_status,
    monobankSyncAwaitingRefresh,
    refresh,
  ]);

  const reportError = (reason: unknown, fallback: string) => {
    setToast({ message: reason instanceof Error ? reason.message : fallback, tone: "error" });
  };

  const beginTransactionDelete = (target: string): boolean => {
    if (transactionDeleteBusy.current) return false;
    transactionDeleteBusy.current = true;
    setTransactionDeleteTarget(target);
    return true;
  };

  const finishTransactionDelete = () => {
    transactionDeleteBusy.current = false;
    setTransactionDeleteTarget(null);
  };

  const refreshTransactionSummary = async (
    requestedPeriodKey: string,
    requestedCurrency: string,
  ) => {
    try {
      const summary = await fetchMoneyTransactionSummary(
        requestedPeriodKey,
        requestedCurrency,
      );
      if (activeMoneyViewKey.current === `${requestedPeriodKey}|${requestedCurrency}`) {
        updateData((current) => ({ ...current, ...summary }));
      }
    } catch (reason) {
      console.warn("[transaction-delete] Summary refresh failed", reason);
    }
  };

  const saveTransaction = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (dialog?.kind !== "transaction") return;
    const form = new FormData(event.currentTarget);
    const isImported = dialog.record?.source !== undefined && dialog.record.source !== "manual";
    const payload = isImported ? {
      category: String(form.get("category")).trim(),
      excluded_from_summary: form.get("excluded_from_summary") === "on",
    } : {
      kind: String(form.get("kind")),
      amount: Number(form.get("amount")),
      category: String(form.get("category")).trim(),
      occurred_on: String(form.get("occurred_on")),
      currency,
      description: String(form.get("description") ?? "").trim() || null,
      excluded_from_summary: form.get("excluded_from_summary") === "on",
    };
    setSaving(true);
    try {
      if (dialog.record) await updateRecord<FinancialTransaction>(`/finance/transactions/${dialog.record.id}`, payload);
      else await createRecord<FinancialTransaction>("/finance/transactions", payload);
      setDialog(null);
      setToast({ message: dialog.record ? "Transaction updated" : "Transaction added", tone: "success" });
      refresh();
    } catch (reason) {
      reportError(reason, "Could not save the transaction.");
    } finally { setSaving(false); }
  };

  const saveMonobankConnection = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (dialog?.kind !== "monobank-connect") return;
    const form = new FormData(event.currentTarget);
    const token = String(form.get("monobank_token") ?? "").trim();
    setSaving(true);
    try {
      await connectMonobank(token);
      setDialog(null);
      setToast({ message: "Monobank connected", tone: "success" });
      refresh();
    } catch (reason) {
      reportError(reason, "Could not connect Monobank.");
    } finally {
      setSaving(false);
    }
  };

  const syncMonobank = async () => {
    if (monobankTrackingRequestCount.current > 0) return;
    if (monobankSyncDateFrom > monobankSyncDateTo) {
      setToast({ message: "Sync start date must be on or before the end date.", tone: "error" });
      return;
    }
    setIntegrationBusy(true);
    try {
      const accepted = await startMonobankSync(monobankSyncDateFrom, monobankSyncDateTo);
      monobankSyncBaseline.current = data?.monobank.last_sync_started_at ?? null;
      setMonobankSyncAwaitingRefresh(true);
      updateData((current) => ({
        ...current,
        monobank: {
          ...current.monobank,
          sync_status: accepted.status,
          sync_progress_current: accepted.sync_progress_current,
          sync_progress_total: accepted.sync_progress_total,
          sync_error: null,
          sync_date_from: accepted.date_from,
          sync_date_to: accepted.date_to,
          last_sync_completed_at: null,
        },
      }));
      setToast({ message: `Monobank sync started for ${monobankSyncDateFrom} – ${monobankSyncDateTo}`, tone: "success" });
    } catch (reason) {
      reportError(reason, "Could not start Monobank sync.");
    } finally {
      setIntegrationBusy(false);
    }
  };

  const removeMonobankTransactions = async (account: MonobankAccount) => {
    const accountLabel = account.masked_pan[0] ?? `${titleCase(account.card_type)} ${account.currency}`;
    if (!window.confirm(`Delete every imported transaction for ${accountLabel}? The card stays connected, and a future sync can import these transactions again.`)) return;
    if (!beginTransactionDelete(`monobank:${account.id}`)) return;
    const requestedPeriodKey = periodKey;
    const requestedCurrency = selectedCurrency;
    try {
      const result = await deleteMonobankAccountTransactions(account.id);
      updateData((current) => ({
        ...current,
        transactions: current.transactions.filter((transaction) => !(
          transaction.source === "monobank"
          && transaction.external_account_id === account.external_id
        )),
      }));
      const suffix = result.deleted_count === 1 ? "transaction" : "transactions";
      setToast({ message: `${result.deleted_count} imported ${suffix} deleted`, tone: "success" });
      await refreshTransactionSummary(requestedPeriodKey, requestedCurrency);
    } catch (reason) {
      reportError(reason, "Could not delete imported Monobank transactions.");
    } finally {
      finishTransactionDelete();
    }
  };

  const setMonobankAccountTracking = async (
    account: MonobankAccount,
    isTracked: boolean,
  ) => {
    if (monobankTrackingAccountIds.has(account.id)) return;
    monobankTrackingRequestCount.current += 1;
    monobankTrackingRevision.current += 1;
    setMonobankTrackingAccountIds((current) => {
      const next = new Set(current);
      next.add(account.id);
      return next;
    });
    updateData((current) => updateMonobankTrackingLocally(
      current,
      account.id,
      isTracked,
    ));
    try {
      const updatedAccount = await updateMonobankAccountTracking(account.id, isTracked);
      updateData((current) => ({
        ...current,
        monobank: {
          ...current.monobank,
          accounts: current.monobank.accounts.map((item) => (
            item.id === updatedAccount.id ? updatedAccount : item
          )),
        },
      }));
      setToast({
        message: isTracked
          ? "Card added to Monobank tracking"
          : "Card removed from Monobank tracking",
        tone: "success",
      });
    } catch (reason) {
      updateData((current) => updateMonobankTrackingLocally(
        current,
        account.id,
        account.is_tracked,
      ));
      reportError(reason, "Could not update Monobank card tracking.");
    } finally {
      monobankTrackingRequestCount.current -= 1;
      setMonobankTrackingAccountIds((current) => {
        const next = new Set(current);
        next.delete(account.id);
        return next;
      });
      if (monobankTrackingRequestCount.current === 0) {
        const trackingRevision = monobankTrackingRevision.current;
        try {
          const summary = await fetchMoneyTrackingSummary(selectedCurrency);
          if (
            monobankTrackingRequestCount.current === 0
            && monobankTrackingRevision.current === trackingRevision
          ) {
            updateData((current) => ({ ...current, ...summary }));
          }
        } catch (reason) {
          console.warn("[monobank-tracking] Summary refresh failed", reason);
        }
      }
    }
  };

  const removeMonobankConnection = async () => {
    if (!window.confirm("Disconnect Monobank? Imported transactions will remain in your ledger.")) return;
    setIntegrationBusy(true);
    try {
      await disconnectMonobank();
      setToast({ message: "Monobank disconnected", tone: "success" });
      refresh();
    } catch (reason) {
      reportError(reason, "Could not disconnect Monobank.");
    } finally {
      setIntegrationBusy(false);
    }
  };

  const saveBudget = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (dialog?.kind !== "budget") return;
    const form = new FormData(event.currentTarget);
    const payload = {
      year: period.year,
      month: period.month,
      category: String(form.get("category")).trim(),
      currency,
      limit_amount: Number(form.get("limit_amount")),
    };
    setSaving(true);
    try {
      if (dialog.record) await updateRecord<MonthlyBudget>(`/finance/budgets/${dialog.record.id}`, payload);
      else await createRecord<MonthlyBudget>("/finance/budgets", payload);
      setDialog(null);
      setToast({ message: dialog.record ? "Budget updated" : "Budget added", tone: "success" });
      refresh();
    } catch (reason) {
      reportError(reason, "Could not save the budget.");
    } finally { setSaving(false); }
  };

  const saveAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (dialog?.kind !== "account") return;
    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get("name")).trim(),
      account_type: String(form.get("account_type")),
      category: String(form.get("category")).trim(),
      balance: Number(form.get("balance")),
      currency,
      include_in_net_worth: form.get("include_in_net_worth") === "on",
      is_savings: form.get("is_savings") === "on",
    };
    setSaving(true);
    try {
      if (dialog.record) await updateRecord<FinancialAccount>(`/wealth/accounts/${dialog.record.id}`, payload);
      else await createRecord<FinancialAccount>("/wealth/accounts", payload);
      setDialog(null);
      setToast({ message: dialog.record ? "Account updated" : "Account added", tone: "success" });
      refresh();
    } catch (reason) {
      reportError(reason, "Could not save the account.");
    } finally { setSaving(false); }
  };

  const saveGoal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (dialog?.kind !== "goal") return;
    const form = new FormData(event.currentTarget);
    const payload: Record<string, unknown> = {
      name: String(form.get("name")).trim(),
      target_amount: Number(form.get("target_amount")),
      currency,
      target_date: String(form.get("target_date") ?? "") || null,
      notes: String(form.get("notes") ?? "").trim() || null,
    };
    if (!dialog.record) payload.current_amount = Number(form.get("current_amount") || 0);
    setSaving(true);
    try {
      if (dialog.record) await updateRecord<SavingsGoal>(`/wealth/savings-goals/${dialog.record.id}`, payload);
      else await createRecord<SavingsGoal>("/wealth/savings-goals", payload);
      setDialog(null);
      setToast({ message: dialog.record ? "Savings goal updated" : "Savings goal added", tone: "success" });
      refresh();
    } catch (reason) {
      reportError(reason, "Could not save the savings goal.");
    } finally { setSaving(false); }
  };

  const saveContribution = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (dialog?.kind !== "contribution") return;
    const form = new FormData(event.currentTarget);
    const payload = {
      kind: String(form.get("kind")),
      amount: Number(form.get("amount")),
      occurred_on: String(form.get("occurred_on")),
      notes: String(form.get("notes") ?? "").trim() || null,
    };
    setSaving(true);
    try {
      if (dialog.record) await updateRecord(`/wealth/savings-contributions/${dialog.record.id}`, payload);
      else await createRecord(`/wealth/savings-goals/${dialog.goal.id}/contributions`, payload);
      setDialog(null);
      setToast({ message: dialog.record ? "Savings activity updated" : "Savings activity added", tone: "success" });
      refresh();
    } catch (reason) {
      reportError(reason, "Could not save the contribution.");
    } finally { setSaving(false); }
  };

  const removeTransaction = async (transaction: FinancialTransaction) => {
    if (!window.confirm("Delete this transaction?")) return;
    if (!beginTransactionDelete(`transaction:${transaction.id}`)) return;
    const requestedPeriodKey = periodKey;
    const requestedCurrency = selectedCurrency;
    try {
      await deleteRecord(`/finance/transactions/${transaction.id}`);
      updateData((current) => ({
        ...current,
        transactions: current.transactions.filter((item) => item.id !== transaction.id),
      }));
      setToast({ message: "Transaction deleted", tone: "success" });
      await refreshTransactionSummary(requestedPeriodKey, requestedCurrency);
    } catch (reason) {
      reportError(reason, "Could not delete the transaction.");
    } finally {
      finishTransactionDelete();
    }
  };

  const removeAllTransactions = async () => {
    const confirmed = window.confirm(
      "Delete every transaction across all periods, currencies, and sources? This cannot be undone. Connected bank transactions can return on a future sync.",
    );
    if (!confirmed || !beginTransactionDelete("all")) return;
    const requestedPeriodKey = periodKey;
    const requestedCurrency = selectedCurrency;
    try {
      const result = await deleteAllTransactions();
      updateData((current) => ({ ...current, transactions: [] }));
      const suffix = result.deleted_count === 1 ? "transaction" : "transactions";
      setToast({ message: `${result.deleted_count} ${suffix} deleted`, tone: "success" });
      await refreshTransactionSummary(requestedPeriodKey, requestedCurrency);
    } catch (reason) {
      reportError(reason, "Could not delete all transactions.");
    } finally {
      finishTransactionDelete();
    }
  };

  const remove = async (path: string, label: string) => {
    if (!window.confirm(`Delete this ${label.toLowerCase()}?`)) return;
    try {
      await deleteRecord(path);
      setToast({ message: `${label} deleted`, tone: "success" });
      refresh();
    } catch (reason) {
      reportError(reason, `Could not delete the ${label.toLowerCase()}.`);
    }
  };

  const captureSnapshot = async () => {
    try {
      await createRecord<NetWorthSnapshot>("/wealth/net-worth-snapshots/capture", { currency });
      setToast({ message: "Net-worth snapshot captured", tone: "success" });
      refresh();
    } catch (reason) {
      reportError(reason, "Could not capture a net-worth snapshot.");
    }
  };

  const dialogTitle = dialog?.kind === "transaction" ? `${dialog.record ? "Edit" : "Add"} transaction`
    : dialog?.kind === "budget" ? `${dialog.record ? "Edit" : "Add"} monthly budget`
      : dialog?.kind === "account" ? `${dialog.record ? "Edit" : "Add"} account`
        : dialog?.kind === "goal" ? `${dialog.record ? "Edit" : "Add"} savings goal`
          : dialog?.kind === "contribution" ? `${dialog.record ? "Edit" : "Add"} savings activity`
            : dialog?.kind === "monobank-connect" ? "Connect Monobank"
            : "Money entry";

  const totalIncome = asNumber(data?.finance.total_income);
  const totalExpenses = asNumber(data?.finance.total_expenses);
  const totalBudget = asNumber(data?.finance.total_budget);
  const budgetRemaining = asNumber(data?.finance.budget_remaining);

  return (
    <>
      <ModuleHeader eyebrow="Money" title="Know where your money is going." description="Manage cash flow, budgets, accounts, savings, and net worth from one live workspace." periodKey={periodKey} initialPeriodKey={initialPeriodKey} onPeriodChange={setPeriodKey} onAdd={() => setDialog(tab === "cashflow" ? { kind: "transaction" } : { kind: "account" })} addLabel={tab === "cashflow" ? "Add transaction" : "Add account"} />
      <div className="money-view-controls">
        <div className="module-tabs" role="tablist" aria-label="Money view">
          <button role="tab" aria-selected={tab === "cashflow"} className={tab === "cashflow" ? "active" : ""} onClick={() => setTab("cashflow")}><ReceiptText size={16} /> Cash flow</button>
          <button role="tab" aria-selected={tab === "wealth"} className={tab === "wealth" ? "active" : ""} onClick={() => setTab("wealth")}><Landmark size={16} /> Wealth & savings</button>
        </div>
        <label className="currency-picker">
          <span>Currency</span>
          <select value={selectedCurrency} onChange={(event) => setSelectedCurrency(event.target.value)} aria-label="Select money currency">
            {currencies.map((item) => <option value={item} key={item}>{item}</option>)}
          </select>
        </label>
      </div>
      {data && <DataNotice loading={loading} error={error} onRetry={refresh} />}
      {data && (
        <section className={`monobank-panel ${data.monobank.connected ? "connected" : "disconnected"}`} aria-label="Monobank integration">
          <div className="monobank-heading">
            <span className="monobank-mark"><Landmark size={20} /></span>
            <div>
              <p className="eyebrow">Bank connection</p>
              <h2>{data.monobank.connected ? data.monobank.client_name : "Monobank"}</h2>
              <p>{data.monobank.connected ? `Last sync: ${dateTime(data.monobank.last_sync_completed_at)}` : "Import personal cards, balances, jars, and the latest 31 days of transactions."}</p>
            </div>
            {data.monobank.connected ? (
              <span className={`connection-badge ${data.monobank.sync_status ?? "idle"}`}><span /> {data.monobank.sync_status === "running" ? "Syncing" : "Connected"}</span>
            ) : (
              <button className="monobank-connect-button" onClick={() => setDialog({ kind: "monobank-connect" })}><Link2 size={16} /> Connect Monobank</button>
            )}
          </div>

          {data.monobank.connected && (
            <>
              <div className="monobank-actions">
                <div>
                  <span>{trackedMonobankAccountCount} of {data.monobank.accounts.length} cards tracked</span>
                  <span>{data.monobank.jars.length} jars</span>
                  <span>Read-only bank data</span>
                </div>
                <button className="quiet-danger-button" disabled={integrationBusy || monobankTrackingBusy || transactionDeleteTarget !== null} onClick={() => void removeMonobankConnection()}><Unplug size={15} /> Disconnect</button>
              </div>

              <div className="monobank-sync-controls">
                <div className="monobank-sync-range">
                  <label><span>From</span><input type="date" value={monobankSyncDateFrom} max={monobankSyncDateTo} disabled={integrationBusy || data.monobank.sync_status === "running"} onChange={(event) => setMonobankSyncDateFrom(event.target.value)} /></label>
                  <label><span>To</span><input type="date" value={monobankSyncDateTo} min={monobankSyncDateFrom} max={today} disabled={integrationBusy || data.monobank.sync_status === "running"} onChange={(event) => setMonobankSyncDateTo(event.target.value)} /></label>
                  <button className="secondary-button" disabled={integrationBusy || monobankTrackingBusy || transactionDeleteTarget !== null || data.monobank.sync_status === "running" || trackedMonobankAccountCount === 0 || !monobankSyncDateFrom || !monobankSyncDateTo} onClick={() => void syncMonobank()}><RefreshCw size={15} className={data.monobank.sync_status === "running" ? "spin" : ""} /> {data.monobank.sync_status === "running" ? "Syncing…" : "Sync tracked cards"}</button>
                </div>
                <p>{trackedMonobankAccountCount === 0 ? "Choose at least one card below before syncing. " : ""}Only tracked cards are included in wealth totals and statement imports. Longer periods are imported in 31-day batches.</p>
              </div>

              {data.monobank.sync_status === "running" && (
                <div className="monobank-sync-progress" role="status">
                  <div><span><CloudDownload size={15} /> Importing statement batch {Math.min(data.monobank.sync_progress_current + 1, Math.max(data.monobank.sync_progress_total, 1))} of {data.monobank.sync_progress_total}</span><strong>{data.monobank.sync_progress_current}/{data.monobank.sync_progress_total}</strong></div>
                  <div className="sync-progress-track"><span style={{ width: `${data.monobank.sync_progress_total ? Math.min((data.monobank.sync_progress_current / data.monobank.sync_progress_total) * 100, 100) : 0}%` }} /></div>
                  <p>{data.monobank.sync_date_from && data.monobank.sync_date_to ? `${data.monobank.sync_date_from} – ${data.monobank.sync_date_to}. ` : ""}Monobank allows statement requests once per minute, so multi-card or multi-month syncs can take several minutes.</p>
                </div>
              )}

              {data.monobank.sync_status === "failed" && data.monobank.sync_error && (
                <div className="monobank-error" role="alert"><CircleAlert size={16} /><span>{data.monobank.sync_error}</span></div>
              )}

              {data.monobank.accounts.length > 0 && (
                <div className="monobank-live-grid">
                  {data.monobank.accounts.map((account) => (
                    <article className={`monobank-account-card ${account.is_tracked ? "tracked" : "untracked"}`} key={account.id}>
                      <div><span className="mono-card-icon"><CreditCard size={17} /></span><span><strong>{account.masked_pan[0] ?? titleCase(account.card_type)}</strong><small>{titleCase(account.card_type)} · {account.currency}</small></span></div>
                      <strong className={asNumber(account.balance) < 0 ? "negative" : ""}>{formatMoney(asNumber(account.balance), account.currency)}</strong>
                      <p>Credit limit <span>{formatMoney(asNumber(account.credit_limit), account.currency)}</span></p>
                      <label className="monobank-track-card">
                        <input
                          type="checkbox"
                          checked={account.is_tracked}
                          disabled={integrationBusy || data.monobank.sync_status === "running" || monobankTrackingAccountIds.has(account.id)}
                          onChange={(event) => void setMonobankAccountTracking(account, event.target.checked)}
                        />
                        <span><strong>Track this card</strong><small>{account.is_tracked ? "Included in totals and future syncs" : "Excluded from totals and future syncs"}</small></span>
                      </label>
                      <button className="monobank-delete-transactions" disabled={integrationBusy || transactionDeleteTarget !== null || data.monobank.sync_status === "running"} onClick={() => void removeMonobankTransactions(account)}><Trash2 size={13} /> Delete imported transactions</button>
                    </article>
                  ))}
                </div>
              )}

              {data.monobank.jars.length > 0 && (
                <div className="monobank-jars">
                  <div className="monobank-subheading"><div><PiggyBank size={16} /><span><strong>Monobank jars</strong><small>Separate from local Savings Goals</small></span></div></div>
                  <div className="monobank-jar-grid">
                    {data.monobank.jars.map((jar) => {
                      const progress = Math.min(asNumber(jar.progress_percent), 100);
                      return (
                        <article className="monobank-jar-card" key={jar.id}>
                          <div><strong>{jar.title}</strong><span>{formatMoney(asNumber(jar.balance), jar.currency)}{jar.goal !== null ? ` of ${formatMoney(asNumber(jar.goal), jar.currency)}` : ""}</span></div>
                          {jar.goal !== null && <><div className="goal-progress"><span style={{ width: `${progress}%` }} /></div><small>{Math.round(progress)}% funded</small></>}
                        </article>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      )}
      {!data ? <ModuleState error={error} onRetry={refresh} /> : tab === "cashflow" ? (
        <>
          <section className="module-stats module-stats-four" aria-label="Cash flow summary">
            <article className="module-stat"><span className="stat-icon lime"><ArrowUpRight size={18} /></span><p>Income</p><strong>{money(totalIncome)}</strong><em>{data.transactions.filter((item) => item.kind === "income" && !item.hold && !item.excluded_from_summary).length} included entries</em></article>
            <article className="module-stat"><span className="stat-icon amber"><ArrowDownRight size={18} /></span><p>Expenses</p><strong>{money(totalExpenses)}</strong><em>{data.transactions.filter((item) => item.kind === "expense" && !item.hold && !item.excluded_from_summary).length} included entries</em></article>
            <article className="module-stat"><span className="stat-icon forest"><TrendingUp size={18} /></span><p>Net cash flow</p><strong className={asNumber(data.finance.net) < 0 ? "negative" : ""}>{money(asNumber(data.finance.net))}</strong><em>Income minus expenses</em></article>
            <article className="module-stat"><span className="stat-icon blue"><WalletCards size={18} /></span><p>Budget left</p><strong className={budgetRemaining < 0 ? "negative" : ""}>{totalBudget ? money(budgetRemaining) : "—"}</strong><em>{totalBudget ? `${money(totalBudget)} planned` : "No budgets yet"}</em></article>
          </section>

          <div className="module-two-column money-layout">
            <section className="module-section budget-module">
              <div className="section-heading"><div><p className="eyebrow">Spending plan</p><h2>Monthly budgets</h2></div><button className="section-action" onClick={() => setDialog({ kind: "budget" })}><Plus size={15} /> Add</button></div>
              {data.budgets.length > 0 ? (
                <div className="budget-module-list">
                  {data.budgets.map((budget) => {
                    const category = data.finance.categories.find((item) => item.category.toLowerCase() === budget.category.toLowerCase());
                    const spent = asNumber(category?.expenses);
                    const limit = asNumber(budget.limit_amount);
                    const percent = Math.min((spent / Math.max(limit, 1)) * 100, 100);
                    return (
                      <div className="budget-module-row" key={budget.id}>
                        <div className="budget-row-top"><div><strong>{titleCase(budget.category)}</strong><span>{money(spent)} of {money(limit)}</span></div><div className="record-actions"><button onClick={() => setDialog({ kind: "budget", record: budget })} aria-label={`Edit ${budget.category} budget`}><Edit3 size={15} /></button><button className="danger" onClick={() => void remove(`/finance/budgets/${budget.id}`, "Budget")} aria-label={`Delete ${budget.category} budget`}><Trash2 size={15} /></button></div></div>
                        <div className="budget-progress"><span className={spent > limit ? "over" : ""} style={{ width: `${percent}%` }} /></div>
                        <small>{spent > limit ? `${money(spent - limit)} over` : `${money(limit - spent)} remaining`}</small>
                      </div>
                    );
                  })}
                </div>
              ) : <EmptyState icon={<Target size={22} />} title="No budgets for this month" description="Add category limits to turn spending into a plan." action="Add budget" onAction={() => setDialog({ kind: "budget" })} />}
            </section>

            <section className="module-section transaction-module">
              <div className="section-heading">
                <div><p className="eyebrow">Ledger</p><h2>Transactions</h2></div>
                <div className="section-heading-actions">
                  <span className="record-count">{data.transactions.length} records</span>
                  <button
                    className="section-delete-all"
                    disabled={integrationBusy || transactionDeleteTarget !== null || data.monobank.sync_status === "running"}
                    onClick={() => void removeAllTransactions()}
                    aria-label="Delete all transactions"
                  >
                    <Trash2 size={13} /> Delete all
                  </button>
                </div>
              </div>
              {data.transactions.length > 0 ? (
                <div className="transaction-list">
                  {data.transactions.map((transaction) => (
                    <article className={`transaction-row ${transaction.hold ? "pending" : ""} ${transaction.excluded_from_summary ? "excluded" : ""}`} key={transaction.id}>
                      <span className={`transaction-icon ${transaction.kind}`} >{transaction.kind === "income" ? <ArrowUpRight size={17} /> : <ArrowDownRight size={17} />}</span>
                      <div className="record-primary"><h3>{transaction.description || titleCase(transaction.category)}</h3><p>{titleCase(transaction.category)} · {shortDate(transaction.occurred_on)} {transaction.source === "monobank" && <span className="record-badge monobank">Monobank</span>} {transaction.hold && <span className="record-badge pending">Pending</span>} {transaction.excluded_from_summary && <span className="record-badge excluded">Excluded</span>}</p></div>
                      <strong className={`transaction-amount ${transaction.kind}`}>{transaction.kind === "expense" ? "−" : "+"}{money(asNumber(transaction.amount))}</strong>
                      <div className="record-actions"><button onClick={() => setDialog({ kind: "transaction", record: transaction })} aria-label={transaction.source === "manual" ? "Edit transaction" : "Categorize imported bank transaction"}><Edit3 size={16} /></button>{transaction.source === "manual" && <button className="danger" disabled={transactionDeleteTarget !== null} onClick={() => void removeTransaction(transaction)} aria-label="Delete transaction"><Trash2 size={16} /></button>}</div>
                    </article>
                  ))}
                </div>
              ) : <EmptyState icon={<ReceiptText size={22} />} title="No transactions this month" description="Income and expenses you record will appear here." action="Add transaction" onAction={() => setDialog({ kind: "transaction" })} />}
            </section>
          </div>
        </>
      ) : (
        <>
          <section className="module-stats module-stats-four" aria-label="Wealth summary">
            <article className="module-stat"><span className="stat-icon lime"><Banknote size={18} /></span><p>Assets</p><strong>{money(asNumber(data.wealth.assets))}</strong><em>Included accounts</em></article>
            <article className="module-stat"><span className="stat-icon amber"><CreditCard size={18} /></span><p>Liabilities</p><strong>{money(asNumber(data.wealth.liabilities))}</strong><em>Included accounts</em></article>
            <article className="module-stat featured"><span className="stat-icon forest"><Landmark size={18} /></span><p>Net worth</p><strong>{money(asNumber(data.wealth.net_worth))}</strong><em>Assets minus liabilities</em></article>
            <article className="module-stat"><span className="stat-icon blue"><PiggyBank size={18} /></span><p>Savings</p><strong>{money(asNumber(data.wealth.savings))}</strong><em>{data.accounts.filter((item) => item.is_savings).length} local accounts · {data.monobank.jars.filter((item) => item.currency === currency).length} jars</em></article>
          </section>

          <div className="module-two-column wealth-grid">
            <section className="module-section">
              <div className="section-heading"><div><p className="eyebrow">Balance sheet</p><h2>Accounts</h2></div><button className="section-action" onClick={() => setDialog({ kind: "account" })}><Plus size={15} /> Add</button></div>
              {data.accounts.length > 0 ? <div className="account-list">{data.accounts.map((account) => (
                <article className="account-row" key={account.id}>
                  <span className={`account-icon ${account.account_type}`} >{account.account_type === "asset" ? <CircleDollarSign size={18} /> : <CreditCard size={18} />}</span>
                  <div className="record-primary"><h3>{account.name}</h3><p>{titleCase(account.category)}{account.is_savings ? " · Savings" : ""}{!account.include_in_net_worth ? " · Excluded" : ""}</p></div>
                  <strong className={account.account_type === "liability" ? "negative" : ""}>{account.account_type === "liability" ? "−" : ""}{money(asNumber(account.balance))}</strong>
                  <div className="record-actions"><button onClick={() => setDialog({ kind: "account", record: account })} aria-label={`Edit ${account.name}`}><Edit3 size={16} /></button><button className="danger" onClick={() => void remove(`/wealth/accounts/${account.id}`, "Account")} aria-label={`Delete ${account.name}`}><Trash2 size={16} /></button></div>
                </article>
              ))}</div> : <EmptyState icon={<Landmark size={22} />} title="No accounts yet" description="Add assets and liabilities to calculate your net worth." action="Add account" onAction={() => setDialog({ kind: "account" })} />}
            </section>

            <section className="module-section goals-module">
              <div className="section-heading"><div><p className="eyebrow">Intentional saving</p><h2>Savings goals</h2></div><button className="section-action" onClick={() => setDialog({ kind: "goal" })}><Plus size={15} /> Add</button></div>
              {data.goals.length > 0 ? <div className="goal-module-list">{data.goals.map((goal) => {
                const progress = Math.min(asNumber(goal.progress_percent), 100);
                return (
                  <article className="goal-module-card" key={goal.id}>
                    <div className="goal-top"><div><h3>{goal.name}</h3><p>{money(asNumber(goal.current_amount))} of {money(asNumber(goal.target_amount))}</p></div><strong>{Math.round(progress)}%</strong></div>
                    <div className="goal-progress"><span style={{ width: `${progress}%` }} /></div>
                    <div className="goal-actions"><span>{goal.target_date ? `Target ${shortDate(goal.target_date)}` : `${money(Math.max(asNumber(goal.target_amount) - asNumber(goal.current_amount), 0))} to go`}</span><button onClick={() => setDialog({ kind: "contribution", goal })}><Plus size={14} /> Activity</button><button onClick={() => setDialog({ kind: "goal", record: goal })} aria-label={`Edit ${goal.name}`}><Edit3 size={15} /></button><button className="danger" onClick={() => void remove(`/wealth/savings-goals/${goal.id}`, "Savings goal")} aria-label={`Delete ${goal.name}`}><Trash2 size={15} /></button></div>
                  </article>
                );
              })}</div> : <EmptyState icon={<PiggyBank size={22} />} title="No savings goals" description="Set a target, then record contributions and withdrawals." action="Add savings goal" onAction={() => setDialog({ kind: "goal" })} />}
            </section>
          </div>

          <div className="module-two-column wealth-history-grid">
            <section className="module-section">
              <div className="section-heading"><div><p className="eyebrow">Savings ledger</p><h2>Goal activity</h2></div><span className="record-count">{data.contributions.length} records</span></div>
              {data.contributions.length > 0 ? <div className="compact-record-list">{data.contributions.map((entry) => {
                const goal = data.goals.find((item) => item.id === entry.goal_id);
                if (!goal) return null;
                return (
                  <article className="compact-record" key={entry.id}>
                    <span className={entry.kind === "contribution" ? "positive-badge" : "negative-badge"}>{entry.kind === "contribution" ? <Plus size={14} /> : <Minus size={14} />}</span>
                    <div><strong>{goalsById.get(entry.goal_id) ?? "Savings goal"}</strong><span>{shortDate(entry.occurred_on)}{entry.notes ? ` · ${entry.notes}` : ""}</span></div>
                    <strong className={entry.kind === "withdrawal" ? "negative" : "positive"}>{entry.kind === "withdrawal" ? "−" : "+"}{money(asNumber(entry.amount))}</strong>
                    <div className="record-actions"><button onClick={() => setDialog({ kind: "contribution", goal, record: entry })} aria-label="Edit savings activity"><Edit3 size={15} /></button><button className="danger" onClick={() => void remove(`/wealth/savings-contributions/${entry.id}`, "Savings activity")} aria-label="Delete savings activity"><Trash2 size={15} /></button></div>
                  </article>
                );
              })}</div> : <EmptyState icon={<PiggyBank size={22} />} title="No activity this month" description="Contributions and withdrawals for this month appear here." />}
            </section>

            <section className="module-section snapshot-module">
              <div className="section-heading"><div><p className="eyebrow">History</p><h2>Net-worth snapshots</h2></div><button className="section-action" onClick={() => void captureSnapshot()}><Camera size={15} /> Capture now</button></div>
              {data.snapshots.length > 0 ? <div className="snapshot-list">{data.snapshots.slice(0, 6).map((snapshot) => (
                <article className="snapshot-row" key={snapshot.id}>
                  <div><strong>{money(asNumber(snapshot.net_worth))}</strong><span>{shortDate(snapshot.recorded_at)}</span></div>
                  <div className="snapshot-breakdown"><span>{money(asNumber(snapshot.assets))} assets</span><span>{money(asNumber(snapshot.liabilities))} liabilities</span></div>
                  <button className="icon-danger" onClick={() => void remove(`/wealth/net-worth-snapshots/${snapshot.id}`, "Snapshot")} aria-label="Delete snapshot"><Trash2 size={15} /></button>
                </article>
              ))}</div> : <EmptyState icon={<Camera size={22} />} title="No snapshots yet" description="Capture your current account balances to build net-worth history." action="Capture now" onAction={() => void captureSnapshot()} />}
            </section>
          </div>
        </>
      )}

      <ModuleDialog open={dialog !== null} title={dialogTitle} eyebrow="Money" saving={saving} onClose={closeDialog}>
        {dialog?.kind === "transaction" && <form className="log-form" onSubmit={saveTransaction} key={dialog.record?.id ?? "new-transaction"}>
          {dialog.record?.source !== undefined && dialog.record.source !== "manual" ? (
            <>
              <div className="dialog-note monobank-note"><ShieldCheck size={16} /><span>Bank amount, date, type, currency, and description are read-only. Your category and exclusion choice remain unchanged after future syncs.</span></div>
              <div className="monobank-readonly-transaction">
                <div><span>Description</span><strong>{dialog.record.description || "Bank transaction"}</strong></div>
                <div><span>Amount</span><strong>{dialog.record.kind === "expense" ? "−" : "+"}{formatMoney(asNumber(dialog.record.amount), dialog.record.currency)}</strong></div>
                <div><span>Date</span><strong>{shortDate(dialog.record.occurred_on)}</strong></div>
                <div><span>Status</span><strong>{dialog.record.hold ? "Pending" : "Booked"}</strong></div>
              </div>
              <label><span>Category</span><input name="category" maxLength={100} defaultValue={dialog.record.category} placeholder="Food" required /></label>
              <div className="checkbox-stack"><label><input name="excluded_from_summary" type="checkbox" defaultChecked={dialog.record.excluded_from_summary} /><span><strong>Exclude from summaries</strong><small>Keep the transaction in the ledger without counting it in cash-flow totals.</small></span></label></div>
            </>
          ) : (
            <>
              <div className="form-grid"><label><span>Type</span><select name="kind" defaultValue={dialog.record?.kind ?? "expense"}><option value="expense">Expense</option><option value="income">Income</option></select></label><label><span>Date</span><input name="occurred_on" type="date" min={period.startDate} max={period.endDate} defaultValue={dialog.record?.occurred_on ?? period.referenceDate} required /></label></div>
              <div className="form-grid"><label><span>Amount</span><div className="input-unit"><input name="amount" type="number" min="0.01" step="0.01" defaultValue={dialog.record ? asNumber(dialog.record.amount) : ""} placeholder="45.00" required /><em>{currency}</em></div></label><label><span>Category</span><input name="category" maxLength={100} defaultValue={dialog.record?.category ?? ""} placeholder="Food" required /></label></div>
              <label><span>Description</span><input name="description" maxLength={500} defaultValue={dialog.record?.description ?? ""} placeholder="What was this for?" /></label>
              <div className="checkbox-stack"><label><input name="excluded_from_summary" type="checkbox" defaultChecked={dialog.record?.excluded_from_summary ?? false} /><span><strong>Exclude from summaries</strong><small>Keep this entry in the ledger without counting it in cash-flow totals.</small></span></label></div>
            </>
          )}
          <SaveActions saving={saving} onCancel={closeDialog} label={dialog.record ? "Save changes" : "Add transaction"} />
        </form>}

        {dialog?.kind === "budget" && <form className="log-form" onSubmit={saveBudget} key={dialog.record?.id ?? "new-budget"}>
          <div className="dialog-note"><Target size={16} /><span>This budget applies to {period.label}. Match its category spelling to your transactions.</span></div>
          <label><span>Category</span><input name="category" maxLength={100} defaultValue={dialog.record?.category ?? ""} placeholder="Food" required /></label>
          <label><span>Monthly limit</span><div className="input-unit"><input name="limit_amount" type="number" min="0.01" step="0.01" defaultValue={dialog.record ? asNumber(dialog.record.limit_amount) : ""} placeholder="600" required /><em>{currency}</em></div></label>
          <SaveActions saving={saving} onCancel={closeDialog} label={dialog.record ? "Save changes" : "Add budget"} />
        </form>}

        {dialog?.kind === "account" && <form className="log-form" onSubmit={saveAccount} key={dialog.record?.id ?? "new-account"}>
          <label><span>Account name</span><input name="name" maxLength={120} defaultValue={dialog.record?.name ?? ""} placeholder="Main checking" required /></label>
          <div className="form-grid"><label><span>Type</span><select name="account_type" defaultValue={dialog.record?.account_type ?? "asset"}><option value="asset">Asset</option><option value="liability">Liability</option></select></label><label><span>Category</span><input name="category" maxLength={80} defaultValue={dialog.record?.category ?? ""} placeholder="Cash, loan, investment…" required /></label></div>
          <label><span>Current balance</span><div className="input-unit"><input name="balance" type="number" min="0" step="0.01" defaultValue={dialog.record ? asNumber(dialog.record.balance) : ""} placeholder="2500" required /><em>{currency}</em></div></label>
          <div className="checkbox-stack"><label><input name="include_in_net_worth" type="checkbox" defaultChecked={dialog.record?.include_in_net_worth ?? true} /><span><strong>Include in net worth</strong><small>Use this balance in wealth totals and snapshots.</small></span></label><label><input name="is_savings" type="checkbox" defaultChecked={dialog.record?.is_savings ?? false} /><span><strong>Mark as savings</strong><small>Include this asset in the savings total.</small></span></label></div>
          <SaveActions saving={saving} onCancel={closeDialog} label={dialog.record ? "Save changes" : "Add account"} />
        </form>}

        {dialog?.kind === "goal" && <form className="log-form" onSubmit={saveGoal} key={dialog.record?.id ?? "new-goal"}>
          <label><span>Goal name</span><input name="name" maxLength={120} defaultValue={dialog.record?.name ?? ""} placeholder="Emergency fund" required /></label>
          <div className="form-grid"><label><span>Target amount</span><div className="input-unit"><input name="target_amount" type="number" min="0.01" step="0.01" defaultValue={dialog.record ? asNumber(dialog.record.target_amount) : ""} placeholder="12000" required /><em>{currency}</em></div></label>{!dialog.record && <label><span>Already saved</span><div className="input-unit"><input name="current_amount" type="number" min="0" step="0.01" defaultValue="0" /><em>{currency}</em></div></label>}</div>
          <label><span>Target date (optional)</span><input name="target_date" type="date" defaultValue={dialog.record?.target_date ?? ""} /></label>
          <label><span>Notes</span><textarea name="notes" rows={3} maxLength={500} defaultValue={dialog.record?.notes ?? ""} placeholder="What this goal makes possible" /></label>
          <SaveActions saving={saving} onCancel={closeDialog} label={dialog.record ? "Save changes" : "Add goal"} />
        </form>}

        {dialog?.kind === "contribution" && <form className="log-form" onSubmit={saveContribution} key={dialog.record?.id ?? `new-${dialog.goal.id}`}>
          <div className="dialog-note"><PiggyBank size={16} /><span>Recording activity for <strong>{dialog.goal.name}</strong>.</span></div>
          <div className="form-grid"><label><span>Activity</span><select name="kind" defaultValue={dialog.record?.kind ?? "contribution"}><option value="contribution">Contribution</option><option value="withdrawal">Withdrawal</option></select></label><label><span>Date</span><input name="occurred_on" type="date" min={period.startDate} max={period.endDate} defaultValue={dialog.record?.occurred_on ?? period.referenceDate} required /></label></div>
          <label><span>Amount</span><div className="input-unit"><input name="amount" type="number" min="0.01" step="0.01" defaultValue={dialog.record ? asNumber(dialog.record.amount) : ""} placeholder="250" required /><em>{currency}</em></div></label>
          <label><span>Notes</span><input name="notes" maxLength={500} defaultValue={dialog.record?.notes ?? ""} placeholder="Payday transfer" /></label>
          <SaveActions saving={saving} onCancel={closeDialog} label={dialog.record ? "Save changes" : "Add activity"} />
        </form>}

        {dialog?.kind === "monobank-connect" && <form className="log-form monobank-connect-form" onSubmit={saveMonobankConnection}>
          <div className="dialog-note monobank-note"><ShieldCheck size={17} /><span>Your personal token is sent directly to the Better Tracker backend over this connection, encrypted with Fernet, and never returned to the browser after connect.</span></div>
          <label><span>Personal API token</span><input name="monobank_token" type="password" autoComplete="off" spellCheck={false} placeholder="Paste your Monobank token" required /></label>
          <p className="field-help">Create a personal token in the official Monobank API cabinet. Use Better Tracker over HTTPS outside local development.</p>
          <div className="connection-scope"><strong>Read-only import</strong><span>Client name, cards, balances, credit limits, jars, and a user-selected statement period (one month by default). No payments, webhooks, or scheduled sync.</span></div>
          <SaveActions saving={saving} onCancel={closeDialog} label="Connect securely" />
        </form>}

      </ModuleDialog>
      {toast && <ModuleToast {...toast} onClose={() => setToast(null)} />}
    </>
  );
}
