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
  LayoutDashboard,
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
} from "lucide-react";
import type { FormEvent, KeyboardEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DataNotice, EmptyState, ModuleDialog, ModuleHeader, ModuleState, ModuleToast, MonthPickerInput, SaveActions } from "@/components/module-ui";
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
  fetchMoneyCategoryTransactions,
  fetchMoneyData,
  fetchMoneyOverview,
  fetchMoneyTrackingSummary,
  fetchMoneyTransactionSummary,
  type FinancialAccount,
  type FinancialTransaction,
  type FinanceSummary,
  type MonobankAccount,
  type MonobankJar,
  type MoneyData,
  type MonthlyBudget,
  type NetWorthSnapshot,
  type SavingsContribution,
  type SavingsGoal,
  startMonobankSync,
  updateMonobankAccountTracking,
  updateMonobankJarTracking,
  updateRecord,
} from "@/lib/module-api";
import { formatMoney, getPeriod } from "@/lib/tracker-api";
import { useLocale } from "@/lib/i18n";
import {
  browserAuthenticatedUserId,
  clearModuleDataSnapshots,
} from "@/lib/module-data-cache";
import { moneyMonthRange, summarizeMoney } from "@/lib/money-overview";

type Toast = { message: string; tone: "success" | "error" };
type MoneyTab = "overview" | "cashflow" | "wealth" | "sources";
type MoneyDialog =
  | { kind: "transaction"; record?: FinancialTransaction }
  | { kind: "budget"; record?: MonthlyBudget }
  | { kind: "account"; record?: FinancialAccount }
  | { kind: "goal"; record?: SavingsGoal }
  | { kind: "contribution"; goal: SavingsGoal; record?: SavingsContribution }
  | { kind: "monobank-connect" };

function shortDate(date: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${date.slice(0, 10)}T12:00:00Z`));
}

function titleCase(value: string): string {
  return value.split(/\s+/).filter(Boolean).map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");
}

function dateTime(value: string | null, locale: string): string {
  if (!value) return locale === "uk-UA" ? "Ніколи" : "Never";
  return new Intl.DateTimeFormat(locale, {
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

function shiftMonth(value: string, months: number): string {
  const [year, month] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + months, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function updateMonobankTrackingLocally(
  current: MoneyData,
  accountId: string,
  isTracked: boolean,
  includeIgnored: boolean,
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
    transactions: !includeIgnored && !isTracked
      ? current.transactions.filter((transaction) => !(
        transaction.source === "monobank"
        && transaction.external_account_id === account.external_id
      ))
      : current.transactions,
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

function updateMonobankJarTrackingLocally(
  current: MoneyData,
  jarId: string,
  isTracked: boolean,
): MoneyData {
  const jar = current.monobank.jars.find((item) => item.id === jarId);
  if (!jar || jar.is_tracked === isTracked) return current;

  const direction = isTracked ? 1 : -1;
  const balance = asNumber(jar.balance);
  const affectsSelectedCurrency = jar.currency === current.wealth.currency;
  const assets = affectsSelectedCurrency
    ? Math.max(0, asNumber(current.wealth.assets) + direction * balance)
    : asNumber(current.wealth.assets);
  const savings = affectsSelectedCurrency
    ? Math.max(0, asNumber(current.wealth.savings) + direction * balance)
    : asNumber(current.wealth.savings);

  return {
    ...current,
    wealth: affectsSelectedCurrency
      ? { ...current.wealth, assets, savings, net_worth: assets - asNumber(current.wealth.liabilities) }
      : current.wealth,
    monobank: {
      ...current.monobank,
      jars: current.monobank.jars.map((item) => (
        item.id === jarId ? { ...item, is_tracked: isTracked } : item
      )),
    },
  };
}

function isIgnoredTransaction(
  transaction: FinancialTransaction,
  accounts: MonobankAccount[],
): boolean {
  return transaction.source === "monobank" && !accounts.some((account) => (
    account.external_id === transaction.external_account_id && account.is_tracked
  ));
}

export default function MoneyPage({
  initialPeriodKey,
  latestPeriodKey,
  initialCurrency = "UAH",
  initialCategory,
  initialTab,
}: {
  initialPeriodKey: string;
  latestPeriodKey: string;
  initialCurrency?: string;
  initialCategory?: string;
  initialTab?: MoneyTab;
}) {
  const { userId, locale, intlLocale, t } = useLocale();
  const [periodKey, setPeriodKey] = useState(initialPeriodKey);
  const [selectedCurrency, setSelectedCurrency] = useState(initialCurrency);
  const [categoryFilter, setCategoryFilter] = useState(initialCategory);
  const [tab, setTab] = useState<MoneyTab>(initialTab ?? (initialCategory ? "cashflow" : "overview"));
  const [overviewStart, setOverviewStart] = useState(() => shiftMonth(initialPeriodKey, -5));
  const [overviewEnd, setOverviewEnd] = useState(initialPeriodKey);
  const [overviewCustomOpen, setOverviewCustomOpen] = useState(false);
  const [includeIgnored, setIncludeIgnored] = useState(false);
  const [showAllTracked, setShowAllTracked] = useState(false);
  const [showAllIgnored, setShowAllIgnored] = useState(false);
  const [monobankSyncDateTo, setMonobankSyncDateTo] = useState(() => kyivDate());
  const [monobankSyncDateFrom, setMonobankSyncDateFrom] = useState(() => shiftDate(kyivDate(), -30));
  const moneyLoader = useCallback((requestKey: string, signal?: AbortSignal) => {
    const [requestedPeriod, requestedCurrency, requestedIncludeIgnored, requestedCategory] = requestKey.split("|");
    return fetchMoneyData(
      requestedPeriod,
      requestedCurrency,
      requestedIncludeIgnored === "true",
      requestedCategory ? decodeURIComponent(requestedCategory) : undefined,
      signal,
    );
  }, []);
  const moneyCategoryFilter = tab === "cashflow" ? categoryFilter : undefined;
  const moneyViewKey = `${periodKey}|${selectedCurrency}|${includeIgnored}|${encodeURIComponent(moneyCategoryFilter ?? "")}`;
  const { data, loading, stale, error, refresh, updateData } = useModuleData("money", moneyViewKey, moneyLoader);
  const overviewLoader = useCallback((requestKey: string, signal?: AbortSignal) => {
    const [startMonth, endMonth, requestedCurrency] = requestKey.split("|");
    return fetchMoneyOverview(startMonth, endMonth, requestedCurrency, signal);
  }, []);
  const overviewViewKey = `${overviewStart}|${overviewEnd}|${selectedCurrency}`;
  const {
    data: overviewSummaries,
    loading: overviewLoading,
    stale: overviewStale,
    error: overviewError,
    refresh: refreshOverview,
  } = useModuleData<FinanceSummary[]>("money-overview", overviewViewKey, overviewLoader);
  const categoryTransactionLoader = useCallback((requestKey: string, signal?: AbortSignal) => {
    const [startMonth, endMonth, requestedCurrency, requestedCategory] = requestKey.split("|");
    return fetchMoneyCategoryTransactions(
      startMonth,
      endMonth,
      requestedCurrency,
      requestedCategory ? decodeURIComponent(requestedCategory) : "",
      signal,
    );
  }, []);
  const categoryTransactionKey = `${overviewStart}|${overviewEnd}|${selectedCurrency}|${tab === "overview" ? encodeURIComponent(categoryFilter ?? "") : ""}`;
  const {
    data: categoryTransactions,
    loading: categoryTransactionsLoading,
    stale: categoryTransactionsStale,
    error: categoryTransactionsError,
    refresh: refreshCategoryTransactions,
  } = useModuleData<FinancialTransaction[]>("money-category", categoryTransactionKey, categoryTransactionLoader);
  const [dialog, setDialog] = useState<MoneyDialog | null>(null);
  const [saving, setSaving] = useState(false);
  const [integrationBusy, setIntegrationBusy] = useState(false);
  const [monobankTrackingSourceIds, setMonobankTrackingSourceIds] = useState<Set<string>>(() => new Set());
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
  const period = getPeriod(periodKey, new Date(), intlLocale);
  const displayPeriod = getPeriod(data?.period.key ?? periodKey, new Date(), intlLocale);
  const currency = data?.finance.currency ?? selectedCurrency;
  const overviewCurrency = overviewSummaries?.[0]?.currency ?? selectedCurrency;
  const hasMonthlyBudget = asNumber(data?.finance.total_budget) > 0;
  const money = useCallback((value: number) => formatMoney(value, currency, intlLocale), [currency, intlLocale]);
  const overviewMoney = useCallback((value: number) => formatMoney(value, overviewCurrency, intlLocale), [overviewCurrency, intlLocale]);
  const closeDialog = useCallback(() => setDialog(null), []);
  const goalsById = useMemo(() => new Map(data?.goals.map((goal) => [goal.id, goal.name]) ?? []), [data?.goals]);
  const currencies = useMemo(() => {
    const values = new Set(["UAH", selectedCurrency, ...(data?.currencies ?? [])]);
    return Array.from(values).sort((left, right) => left === "UAH" ? -1 : right === "UAH" ? 1 : left.localeCompare(right));
  }, [data?.currencies, selectedCurrency]);
  const trackedMonobankAccountCount = data?.monobank.accounts.filter((account) => account.is_tracked).length ?? 0;
  const trackedMonobankJarCount = data?.monobank.jars.filter((jar) => jar.is_tracked).length ?? 0;
  const monobankTrackingBusy = monobankTrackingSourceIds.size > 0;

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
      if (browserAuthenticatedUserId() !== userId) {
        controller.abort();
        clearModuleDataSnapshots(userId);
        window.location.reload();
        return;
      }
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
  }, [shouldPollMonobank, updateData, userId]);

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
      refreshOverview();
      if (currentStatus === "succeeded") {
        setToast({ message: t("Monobank sync complete. Money data refreshed.", "Синхронізацію Monobank завершено. Дані оновлено."), tone: "success" });
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [
    data?.monobank.last_sync_started_at,
    data?.monobank.sync_status,
    monobankSyncAwaitingRefresh,
    refresh,
    refreshOverview,
    t,
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
      if (activeMoneyViewKey.current.startsWith(`${requestedPeriodKey}|${requestedCurrency}|`)) {
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
      currency: dialog.record?.currency ?? selectedCurrency,
      description: String(form.get("description") ?? "").trim() || null,
      excluded_from_summary: form.get("excluded_from_summary") === "on",
    };
    setSaving(true);
    try {
      if (dialog.record) await updateRecord<FinancialTransaction>(`/finance/transactions/${dialog.record.id}`, payload);
      else await createRecord<FinancialTransaction>("/finance/transactions", payload);
      setDialog(null);
      setToast({ message: dialog.record ? t("Transaction updated", "Транзакцію оновлено") : t("Transaction added", "Транзакцію додано"), tone: "success" });
      refresh();
      refreshOverview();
      refreshCategoryTransactions();
    } catch (reason) {
      reportError(reason, t("Could not save the transaction.", "Не вдалося зберегти транзакцію."));
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
      setToast({ message: t("Monobank connected", "Monobank підключено"), tone: "success" });
      refresh();
      refreshOverview();
    } catch (reason) {
      reportError(reason, t("Could not connect Monobank.", "Не вдалося підключити Monobank."));
    } finally {
      setSaving(false);
    }
  };

  const syncMonobank = async () => {
    if (monobankTrackingRequestCount.current > 0) return;
    if (monobankSyncDateFrom > monobankSyncDateTo) {
      setToast({ message: t("Sync start date must be on or before the end date.", "Дата початку синхронізації має бути не пізніше дати завершення."), tone: "error" });
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
      setToast({ message: t(`Monobank sync started for ${monobankSyncDateFrom} – ${monobankSyncDateTo}`, `Синхронізацію Monobank за ${monobankSyncDateFrom} – ${monobankSyncDateTo} розпочато`), tone: "success" });
    } catch (reason) {
      reportError(reason, t("Could not start Monobank sync.", "Не вдалося почати синхронізацію Monobank."));
    } finally {
      setIntegrationBusy(false);
    }
  };

  const removeMonobankTransactions = async (account: MonobankAccount) => {
    const accountLabel = account.masked_pan[0] ?? `${titleCase(account.card_type)} ${account.currency}`;
    if (!window.confirm(t(`Delete every imported transaction for ${accountLabel}? The card stays connected, and a future sync can import these transactions again.`, `Видалити всі імпортовані транзакції для ${accountLabel}? Картка залишиться підключеною, а наступна синхронізація зможе імпортувати їх знову.`))) return;
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
      const suffix = result.deleted_count === 1 ? t("transaction", "транзакцію") : t("transactions", "транзакцій");
      setToast({ message: t(`${result.deleted_count} imported ${suffix} deleted`, `Видалено імпортованих транзакцій: ${result.deleted_count}`), tone: "success" });
      await refreshTransactionSummary(requestedPeriodKey, requestedCurrency);
      refreshOverview();
    } catch (reason) {
      reportError(reason, t("Could not delete imported Monobank transactions.", "Не вдалося видалити імпортовані транзакції Monobank."));
    } finally {
      finishTransactionDelete();
    }
  };

  const setMonobankAccountTracking = async (
    account: MonobankAccount,
    isTracked: boolean,
  ) => {
    if (monobankTrackingSourceIds.has(account.id)) return;
    monobankTrackingRequestCount.current += 1;
    monobankTrackingRevision.current += 1;
    setMonobankTrackingSourceIds((current) => {
      const next = new Set(current);
      next.add(account.id);
      return next;
    });
    updateData((current) => updateMonobankTrackingLocally(
      current,
      account.id,
      isTracked,
      includeIgnored,
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
          ? t("Card added to Monobank tracking", "Картку додано до відстеження Monobank")
          : t("Card removed from Monobank tracking", "Картку вилучено з відстеження Monobank"),
        tone: "success",
      });
    } catch (reason) {
      updateData((current) => updateMonobankTrackingLocally(
        current,
        account.id,
        account.is_tracked,
        includeIgnored,
      ));
      reportError(reason, t("Could not update Monobank card tracking.", "Не вдалося оновити відстеження картки Monobank."));
    } finally {
      monobankTrackingRequestCount.current -= 1;
      setMonobankTrackingSourceIds((current) => {
        const next = new Set(current);
        next.delete(account.id);
        return next;
      });
      if (monobankTrackingRequestCount.current === 0) {
        const trackingRevision = monobankTrackingRevision.current;
        try {
          const summary = await fetchMoneyTrackingSummary(periodKey, selectedCurrency, includeIgnored, moneyCategoryFilter);
          if (
            monobankTrackingRequestCount.current === 0
            && monobankTrackingRevision.current === trackingRevision
          ) {
            updateData((current) => ({ ...current, ...summary }));
            refreshOverview();
          }
        } catch (reason) {
          console.warn("[monobank-tracking] Summary refresh failed", reason);
        }
      }
    }
  };

  const setMonobankJarTracking = async (
    jar: MonobankJar,
    isTracked: boolean,
  ) => {
    if (monobankTrackingSourceIds.has(jar.id)) return;
    monobankTrackingRequestCount.current += 1;
    monobankTrackingRevision.current += 1;
    setMonobankTrackingSourceIds((current) => new Set(current).add(jar.id));
    updateData((current) => updateMonobankJarTrackingLocally(current, jar.id, isTracked));
    try {
      const updatedJar = await updateMonobankJarTracking(jar.id, isTracked);
      updateData((current) => ({
        ...current,
        monobank: {
          ...current.monobank,
          jars: current.monobank.jars.map((item) => (
            item.id === updatedJar.id ? updatedJar : item
          )),
        },
      }));
      setToast({
        message: isTracked
          ? t("Jar added to tracking", "Банку додано до відстеження")
          : t("Jar removed from tracking", "Банку вилучено з відстеження"),
        tone: "success",
      });
    } catch (reason) {
      updateData((current) => updateMonobankJarTrackingLocally(current, jar.id, jar.is_tracked));
      reportError(reason, t("Could not update Monobank jar tracking.", "Не вдалося оновити відстеження банки Monobank."));
    } finally {
      monobankTrackingRequestCount.current -= 1;
      setMonobankTrackingSourceIds((current) => {
        const next = new Set(current);
        next.delete(jar.id);
        return next;
      });
      if (monobankTrackingRequestCount.current === 0) {
        const trackingRevision = monobankTrackingRevision.current;
        try {
          const summary = await fetchMoneyTrackingSummary(periodKey, selectedCurrency, includeIgnored, moneyCategoryFilter);
          if (
            monobankTrackingRequestCount.current === 0
            && monobankTrackingRevision.current === trackingRevision
          ) {
            updateData((current) => ({ ...current, ...summary }));
            refreshOverview();
          }
        } catch (reason) {
          console.warn("[monobank-tracking] Summary refresh failed", reason);
        }
      }
    }
  };

  const removeMonobankConnection = async () => {
    if (!window.confirm(t("Disconnect Monobank? Imported transactions will remain in your ledger.", "Відключити Monobank? Імпортовані транзакції залишаться у журналі."))) return;
    setIntegrationBusy(true);
    try {
      await disconnectMonobank();
      setToast({ message: t("Monobank disconnected", "Monobank відключено"), tone: "success" });
      refresh();
      refreshOverview();
    } catch (reason) {
      reportError(reason, t("Could not disconnect Monobank.", "Не вдалося відключити Monobank."));
    } finally {
      setIntegrationBusy(false);
    }
  };

  const saveBudget = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (dialog?.kind !== "budget") return;
    const form = new FormData(event.currentTarget);
    const payload = {
      year: dialog.record?.year ?? period.year,
      month: dialog.record?.month ?? period.month,
      category: String(form.get("category")).trim(),
      currency: dialog.record?.currency ?? selectedCurrency,
      limit_amount: Number(form.get("limit_amount")),
    };
    setSaving(true);
    try {
      if (dialog.record) await updateRecord<MonthlyBudget>(`/finance/budgets/${dialog.record.id}`, payload);
      else await createRecord<MonthlyBudget>("/finance/budgets", payload);
      setDialog(null);
      setToast({ message: dialog.record ? t("Budget updated", "Бюджет оновлено") : t("Budget added", "Бюджет додано"), tone: "success" });
      refresh();
      refreshOverview();
    } catch (reason) {
      reportError(reason, t("Could not save the budget.", "Не вдалося зберегти бюджет."));
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
      currency: dialog.record?.currency ?? selectedCurrency,
      include_in_net_worth: form.get("include_in_net_worth") === "on",
      is_savings: form.get("is_savings") === "on",
    };
    setSaving(true);
    try {
      if (dialog.record) await updateRecord<FinancialAccount>(`/wealth/accounts/${dialog.record.id}`, payload);
      else await createRecord<FinancialAccount>("/wealth/accounts", payload);
      setDialog(null);
      setToast({ message: dialog.record ? t("Account updated", "Рахунок оновлено") : t("Account added", "Рахунок додано"), tone: "success" });
      refresh();
    } catch (reason) {
      reportError(reason, t("Could not save the account.", "Не вдалося зберегти рахунок."));
    } finally { setSaving(false); }
  };

  const saveGoal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (dialog?.kind !== "goal") return;
    const form = new FormData(event.currentTarget);
    const payload: Record<string, unknown> = {
      name: String(form.get("name")).trim(),
      target_amount: Number(form.get("target_amount")),
      currency: dialog.record?.currency ?? selectedCurrency,
      target_date: String(form.get("target_date") ?? "") || null,
      notes: String(form.get("notes") ?? "").trim() || null,
    };
    if (!dialog.record) payload.current_amount = Number(form.get("current_amount") || 0);
    setSaving(true);
    try {
      if (dialog.record) await updateRecord<SavingsGoal>(`/wealth/savings-goals/${dialog.record.id}`, payload);
      else await createRecord<SavingsGoal>("/wealth/savings-goals", payload);
      setDialog(null);
      setToast({ message: dialog.record ? t("Savings goal updated", "Ціль заощаджень оновлено") : t("Savings goal added", "Ціль заощаджень додано"), tone: "success" });
      refresh();
    } catch (reason) {
      reportError(reason, t("Could not save the savings goal.", "Не вдалося зберегти ціль заощаджень."));
    } finally { setSaving(false); }
  };

  const saveContribution = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (dialog?.kind !== "contribution") return;
    if (dialog.goal.currency !== selectedCurrency) {
      setDialog(null);
      setToast({ message: t("Wait for the selected currency to finish loading.", "Зачекайте, доки завантажиться вибрана валюта."), tone: "error" });
      return;
    }
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
      setToast({ message: dialog.record ? t("Savings activity updated", "Операцію заощаджень оновлено") : t("Savings activity added", "Операцію заощаджень додано"), tone: "success" });
      refresh();
    } catch (reason) {
      reportError(reason, t("Could not save the contribution.", "Не вдалося зберегти внесок."));
    } finally { setSaving(false); }
  };

  const removeTransaction = async (transaction: FinancialTransaction) => {
    if (!window.confirm(t("Delete this transaction?", "Видалити цю транзакцію?"))) return;
    if (!beginTransactionDelete(`transaction:${transaction.id}`)) return;
    const requestedPeriodKey = periodKey;
    const requestedCurrency = selectedCurrency;
    try {
      await deleteRecord(`/finance/transactions/${transaction.id}`);
      updateData((current) => ({
        ...current,
        transactions: current.transactions.filter((item) => item.id !== transaction.id),
      }));
      setToast({ message: t("Transaction deleted", "Транзакцію видалено"), tone: "success" });
      await refreshTransactionSummary(requestedPeriodKey, requestedCurrency);
      refreshOverview();
      refreshCategoryTransactions();
    } catch (reason) {
      reportError(reason, t("Could not delete the transaction.", "Не вдалося видалити транзакцію."));
    } finally {
      finishTransactionDelete();
    }
  };

  const removeAllTransactions = async () => {
    const confirmed = window.confirm(
      t("Delete every transaction across all periods, currencies, and sources? This cannot be undone. Connected bank transactions can return on a future sync.", "Видалити всі транзакції за всі періоди, валюти й джерела? Цю дію не можна скасувати. Банківські транзакції можуть повернутися під час наступної синхронізації."),
    );
    if (!confirmed || !beginTransactionDelete("all")) return;
    const requestedPeriodKey = periodKey;
    const requestedCurrency = selectedCurrency;
    try {
      const result = await deleteAllTransactions();
      updateData((current) => ({ ...current, transactions: [] }));
      const suffix = result.deleted_count === 1 ? "transaction" : "transactions";
      setToast({ message: t(`${result.deleted_count} ${suffix} deleted`, `Видалено транзакцій: ${result.deleted_count}`), tone: "success" });
      await refreshTransactionSummary(requestedPeriodKey, requestedCurrency);
      refreshOverview();
    } catch (reason) {
      reportError(reason, t("Could not delete all transactions.", "Не вдалося видалити всі транзакції."));
    } finally {
      finishTransactionDelete();
    }
  };

  const remove = async (path: string, label: string) => {
    const localizedLabel = locale === "uk" ? ({ Budget: "бюджет", Account: "рахунок", "Savings goal": "ціль заощаджень", "Savings activity": "операцію заощаджень", Snapshot: "знімок" } as Record<string, string>)[label] ?? label : label.toLowerCase();
    if (!window.confirm(t(`Delete this ${label.toLowerCase()}?`, `Видалити ${localizedLabel}?`))) return;
    try {
      await deleteRecord(path);
      setToast({ message: t(`${label} deleted`, `${localizedLabel[0].toUpperCase()}${localizedLabel.slice(1)} видалено`), tone: "success" });
      refresh();
      if (label === "Budget") refreshOverview();
    } catch (reason) {
      reportError(reason, t(`Could not delete the ${label.toLowerCase()}.`, `Не вдалося видалити ${localizedLabel}.`));
    }
  };

  const captureSnapshot = async () => {
    try {
      await createRecord<NetWorthSnapshot>("/wealth/net-worth-snapshots/capture", { currency: selectedCurrency });
      setToast({ message: t("Net-worth snapshot captured", "Знімок чистих активів створено"), tone: "success" });
      refresh();
    } catch (reason) {
      reportError(reason, t("Could not capture a net-worth snapshot.", "Не вдалося створити знімок чистих активів."));
    }
  };

  const dialogTitle = dialog?.kind === "transaction" ? (dialog.record ? t("Edit transaction", "Редагувати транзакцію") : t("Add transaction", "Додати транзакцію"))
    : dialog?.kind === "budget" ? (dialog.record ? t("Edit monthly budget", "Редагувати місячний бюджет") : t("Add monthly budget", "Додати місячний бюджет"))
      : dialog?.kind === "account" ? (dialog.record ? t("Edit account", "Редагувати рахунок") : t("Add account", "Додати рахунок"))
        : dialog?.kind === "goal" ? (dialog.record ? t("Edit savings goal", "Редагувати ціль заощаджень") : t("Add savings goal", "Додати ціль заощаджень"))
          : dialog?.kind === "contribution" ? (dialog.record ? t("Edit savings activity", "Редагувати операцію заощаджень") : t("Add savings activity", "Додати операцію заощаджень"))
            : dialog?.kind === "monobank-connect" ? t("Connect Monobank", "Підключити Monobank")
            : t("Money entry", "Фінансовий запис");

  const analytics = useMemo(() => {
    return summarizeMoney(overviewSummaries ?? []);
  }, [overviewSummaries]);
  const overviewMonthCount = moneyMonthRange(overviewStart, overviewEnd).length;
  const overviewStartLabel = getPeriod(overviewStart, new Date(`${overviewStart}-15T12:00:00Z`), intlLocale).label;
  const overviewEndLabel = getPeriod(overviewEnd, new Date(`${overviewEnd}-15T12:00:00Z`), intlLocale).label;
  const overviewPeriodLabel = overviewStart === overviewEnd ? overviewEndLabel : `${overviewStartLabel} – ${overviewEndLabel}`;
  const visibleCategoryTransactions = (categoryTransactions ?? []).filter(
    (transaction) => transaction.category.toLocaleLowerCase() === categoryFilter?.toLocaleLowerCase(),
  );
  const categoryTotal = visibleCategoryTransactions.reduce((total, transaction) => total + asNumber(transaction.amount), 0);
  const categoryCurrency = visibleCategoryTransactions[0]?.currency ?? selectedCurrency;
  const visibleTransactions = data?.transactions.filter((transaction) => (
    (includeIgnored || !isIgnoredTransaction(transaction, data.monobank.accounts))
    && (!moneyCategoryFilter || (
      transaction.kind === "expense"
      && transaction.category.toLocaleLowerCase() === moneyCategoryFilter.toLocaleLowerCase()
    ))
  )) ?? [];
  const trackedSources = useMemo(() => [
    ...(data?.monobank.accounts.map((item) => ({ kind: "account" as const, item })) ?? []),
    ...(data?.monobank.jars.map((item) => ({ kind: "jar" as const, item })) ?? []),
  ].filter(({ item }) => item.is_tracked), [data?.monobank.accounts, data?.monobank.jars]);
  const ignoredSources = useMemo(() => [
    ...(data?.monobank.accounts.map((item) => ({ kind: "account" as const, item })) ?? []),
    ...(data?.monobank.jars.map((item) => ({ kind: "jar" as const, item })) ?? []),
  ].filter(({ item }) => !item.is_tracked), [data?.monobank.accounts, data?.monobank.jars]);
  const tabOrder: MoneyTab[] = ["overview", "cashflow", "wealth", "sources"];
  const contentRefreshing = loading || stale || (tab === "overview" && (categoryFilter
    ? categoryTransactionsLoading || categoryTransactionsStale
    : overviewLoading || overviewStale));
  const dialogCurrency = dialog?.kind === "transaction" ? dialog.record?.currency ?? selectedCurrency
    : dialog?.kind === "budget" ? dialog.record?.currency ?? selectedCurrency
      : dialog?.kind === "account" ? dialog.record?.currency ?? selectedCurrency
        : dialog?.kind === "goal" ? dialog.record?.currency ?? selectedCurrency
          : dialog?.kind === "contribution" ? dialog.goal.currency
            : selectedCurrency;

  const selectOverviewStart = (value: string) => {
    if (!value) return;
    setOverviewStart(value);
    if (overviewEnd < value) setOverviewEnd(value);
    else if (overviewEnd > shiftMonth(value, 11)) setOverviewEnd(shiftMonth(value, 11));
  };

  const selectOverviewEnd = (value: string) => {
    if (!value) return;
    setOverviewEnd(value);
    if (overviewStart > value) setOverviewStart(value);
    else if (overviewStart < shiftMonth(value, -11)) setOverviewStart(shiftMonth(value, -11));
  };

  const selectOverviewPreset = (months: number) => {
    setOverviewStart(shiftMonth(initialPeriodKey, 1 - months));
    setOverviewEnd(initialPeriodKey);
    setOverviewCustomOpen(false);
  };

  const handleTabKey = (event: KeyboardEvent<HTMLButtonElement>, current: MoneyTab) => {
    const offset = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    const next = event.key === "Home" ? tabOrder[0]
      : event.key === "End" ? tabOrder.at(-1)
        : offset ? tabOrder[(tabOrder.indexOf(current) + offset + tabOrder.length) % tabOrder.length]
          : null;
    if (!next) return;
    event.preventDefault();
    setTab(next);
    document.getElementById(`money-tab-${next}`)?.focus();
  };

  return (
    <>
      <ModuleHeader eyebrow={t("Money", "Фінанси")} title={t("Know where your money is going.", "Знайте, куди йдуть ваші гроші.")} description={t("Manage cash flow, budgets, accounts, savings, and net worth from one live workspace.", "Керуйте грошовим потоком, бюджетами, рахунками, заощадженнями та чистими активами.")} />
      <div className="money-view-controls">
        <div className="module-tabs" role="tablist" aria-label={t("Money view", "Розділ фінансів")}>
          <button id="money-tab-overview" role="tab" aria-controls="money-panel-overview" aria-selected={tab === "overview"} tabIndex={tab === "overview" ? 0 : -1} className={tab === "overview" ? "active" : ""} onKeyDown={(event) => handleTabKey(event, "overview")} onClick={() => setTab("overview")}><LayoutDashboard size={16} /> {t("Overview", "Огляд")}</button>
          <button id="money-tab-cashflow" role="tab" aria-controls="money-panel-cashflow" aria-selected={tab === "cashflow"} tabIndex={tab === "cashflow" ? 0 : -1} className={tab === "cashflow" ? "active" : ""} onKeyDown={(event) => handleTabKey(event, "cashflow")} onClick={() => setTab("cashflow")}><ReceiptText size={16} /> {t("Cash flow", "Грошовий потік")}</button>
          <button id="money-tab-wealth" role="tab" aria-controls="money-panel-wealth" aria-selected={tab === "wealth"} tabIndex={tab === "wealth" ? 0 : -1} className={tab === "wealth" ? "active" : ""} onKeyDown={(event) => handleTabKey(event, "wealth")} onClick={() => setTab("wealth")}><Landmark size={16} /> {t("Wealth", "Активи")}</button>
          <button id="money-tab-sources" role="tab" aria-controls="money-panel-sources" aria-selected={tab === "sources"} tabIndex={tab === "sources" ? 0 : -1} className={tab === "sources" ? "active" : ""} onKeyDown={(event) => handleTabKey(event, "sources")} onClick={() => setTab("sources")}><Link2 size={16} /> {t("Bank sync", "Синхронізація")}</button>
        </div>
        <label className="currency-picker">
          <span>{t("Currency", "Валюта")}</span>
          <select value={selectedCurrency} onChange={(event) => setSelectedCurrency(event.target.value)} aria-label={t("Select money currency", "Виберіть валюту")}>
            {currencies.map((item) => <option value={item} key={item}>{item}</option>)}
          </select>
        </label>
      </div>
      {tab === "overview" && (
        <>
          <div className="overview-period-controls">
            <span>{t("Period", "Період")}</span>
            <div className="overview-period-presets" role="group" aria-label={t("Overview period", "Період огляду")}>
              {[1, 3, 6, 12].map((months) => <button
                type="button"
                className={!overviewCustomOpen && overviewEnd === initialPeriodKey && overviewMonthCount === months ? "active" : ""}
                aria-pressed={!overviewCustomOpen && overviewEnd === initialPeriodKey && overviewMonthCount === months}
                onClick={() => selectOverviewPreset(months)}
                key={months}
              >{months} {months === 1 ? t("month", "місяць") : months === 3 ? t("months", "місяці") : t("months", "місяців")}</button>)}
              <button type="button" className={overviewCustomOpen ? "active" : ""} aria-expanded={overviewCustomOpen} onClick={() => setOverviewCustomOpen((open) => !open)}>{t("Custom", "Власний")}</button>
            </div>
          </div>
          {overviewCustomOpen && <div className="money-context-controls overview-custom-range" aria-label={t("Custom overview period", "Власний період огляду")}>
            <label><span>{t("From", "Від")}</span><MonthPickerInput value={overviewStart} max={overviewEnd} onChange={selectOverviewStart} /></label>
            <label><span>{t("To", "До")}</span><MonthPickerInput value={overviewEnd} min={overviewStart} max={latestPeriodKey} onChange={selectOverviewEnd} /></label>
            <span>{overviewMonthCount} {overviewMonthCount === 1 ? t("month", "місяць") : t("months", "місяців")}</span>
          </div>}
        </>
      )}
      {(tab === "cashflow" || tab === "wealth") && (
        <div className="money-context-controls">
          <label><span>{t("Working month", "Робочий місяць")}</span><MonthPickerInput value={periodKey} max={latestPeriodKey} onChange={setPeriodKey} /></label>
          <button className="quick-log-button" onClick={() => setDialog(tab === "cashflow" ? { kind: "transaction" } : { kind: "account" })}><Plus size={17} /> {tab === "cashflow" ? t("Add transaction", "Додати транзакцію") : t("Add account", "Додати рахунок")}</button>
        </div>
      )}
      {data && <DataNotice loading={loading} error={error} onRetry={refresh} />}
      {!data ? <ModuleState error={error} onRetry={refresh} /> : (
        <div className={`refresh-surface ${contentRefreshing ? "is-refreshing" : ""}`} aria-busy={contentRefreshing}>
        {tab === "overview" ? (
        categoryFilter ? (
          <>
            <DataNotice loading={categoryTransactionsLoading} error={categoryTransactionsError} onRetry={refreshCategoryTransactions} />
            <section id="money-panel-overview" role="tabpanel" aria-labelledby="money-tab-overview" className="module-section transaction-module">
              <div className="section-heading">
                <div><p className="eyebrow">{t("Category spending", "Витрати за категорією")}</p><h2>{titleCase(categoryFilter)} · {formatMoney(categoryTotal, categoryCurrency, intlLocale)}</h2><span className="section-caption">{overviewPeriodLabel}</span></div>
                <div className="section-heading-actions">
                  <span className="record-count">{visibleCategoryTransactions.length} {t("records", "записів")}</span>
                  <button className="section-action" onClick={() => setCategoryFilter(undefined)}>← {t("Back to overview", "Назад до огляду")}</button>
                </div>
              </div>
              {categoryTransactionsLoading && visibleCategoryTransactions.length === 0
                ? <EmptyState icon={<RefreshCw className="spin" size={22} />} title={t("Loading transactions", "Завантажуємо транзакції")} description={t("Fetching expenses for this category and period.", "Отримуємо витрати за цією категорією та періодом.")} />
                : visibleCategoryTransactions.length > 0
                  ? <div className="transaction-list">{visibleCategoryTransactions.map((transaction) => (
                    <article className={`transaction-row ${transaction.excluded_from_summary ? "excluded" : ""}`} key={transaction.id}>
                      <span className="transaction-icon expense"><ArrowDownRight size={17} /></span>
                      <div className="record-primary"><h3>{transaction.description || titleCase(transaction.category)}</h3><p>{titleCase(transaction.category)} · {shortDate(transaction.occurred_on, intlLocale)} {transaction.source === "monobank" && <span className="record-badge monobank">Monobank</span>}</p></div>
                      <strong className="transaction-amount expense">−{formatMoney(asNumber(transaction.amount), transaction.currency, intlLocale)}</strong>
                      <div className="record-actions"><button onClick={() => setDialog({ kind: "transaction", record: transaction })} aria-label={transaction.source === "manual" ? t("Edit transaction", "Редагувати транзакцію") : t("Categorize imported bank transaction", "Вибрати категорію імпортованої транзакції")}><Edit3 size={16} /></button>{transaction.source === "manual" && <button className="danger" disabled={transactionDeleteTarget !== null} onClick={() => void removeTransaction(transaction)} aria-label={t("Delete transaction", "Видалити транзакцію")}><Trash2 size={16} /></button>}</div>
                    </article>
                  ))}</div>
                  : <EmptyState icon={<ReceiptText size={22} />} title={t("No matching expenses", "Відповідних витрат немає")} description={t("No counted transactions remain in this category for the selected period.", "У цій категорії за вибраний період не залишилося врахованих транзакцій.")} action={t("Back to overview", "Назад до огляду")} onAction={() => setCategoryFilter(undefined)} />}
            </section>
          </>
        ) : (
          <>
          <DataNotice loading={overviewLoading} error={overviewError} onRetry={refreshOverview} />
          <section id="money-panel-overview" role="tabpanel" aria-labelledby="money-tab-overview" className="module-stats module-stats-four" aria-label={t("Overview summary", "Підсумок огляду")}>
            <article className="module-stat"><span className="stat-icon amber"><ArrowDownRight size={18} /></span><p>{t("Total spent", "Усього витрачено")}</p><strong>{overviewMoney(analytics.totalExpenses)}</strong><em>{t("Selected period", "Вибраний період")}</em></article>
            <article className="module-stat"><span className="stat-icon blue"><ReceiptText size={18} /></span><p>{t("Average monthly spend", "Середні витрати за місяць")}</p><strong>{overviewMoney(analytics.averageExpenses)}</strong><em>{analytics.summaries.length} {t("months included", "місяців враховано")}</em></article>
            <article className="module-stat"><span className="stat-icon lime"><ArrowUpRight size={18} /></span><p>{t("Total income", "Усього доходів")}</p><strong>{overviewMoney(analytics.totalIncome)}</strong><em>{t("Selected period", "Вибраний період")}</em></article>
            <article className="module-stat featured"><span className="stat-icon forest"><TrendingUp size={18} /></span><p>{t("Net cash flow", "Чистий грошовий потік")}</p><strong className={analytics.net < 0 ? "negative" : ""}>{overviewMoney(analytics.net)}</strong><em>{t("Income minus expenses", "Доходи мінус витрати")}</em></article>
          </section>

          <section className="overview-status-grid" aria-label={t("Savings, budget, and connection status", "Стан заощаджень, бюджету й підключення")}>
            <article className="overview-insight"><span>{t("Savings rate", "Рівень заощаджень")}</span><strong>{analytics.savingsRate === null ? "—" : `${Math.round(analytics.savingsRate)}%`}</strong><small>{analytics.savingsRate === null ? t("No income in this period", "У цьому періоді немає доходів") : t("Net as a share of income", "Чистий потік як частка доходу")}</small></article>
            <article className="overview-insight"><span>{t("Monthly budget usage", "Використання місячного бюджету")}</span><strong>{analytics.budgetUsage === null ? "—" : `${Math.round(analytics.budgetUsage)}%`}</strong><small>{analytics.budgetUsage === null ? t(`No budget in ${overviewEndLabel}`, `Немає бюджету за ${overviewEndLabel}`) : `${overviewMoney(analytics.budgetMonthExpenses)} ${t("of", "з")} ${overviewMoney(analytics.budgetMonthTotal)} · ${overviewEndLabel}`}</small></article>
            <article className="overview-connection">
              <span className="monobank-mark"><Landmark size={18} /></span>
              <div><span>{data.monobank.connected ? t("Monobank connected", "Monobank підключено") : t("No bank connected", "Банк не підключено")}</span><strong>{trackedMonobankAccountCount} {t("cards", "карток")} · {trackedMonobankJarCount} {t("jars tracked", "банок відстежується")}</strong><small>{t("Last sync", "Остання синхронізація")}: {dateTime(data.monobank.last_sync_completed_at, intlLocale)}</small></div>
              <button type="button" onClick={() => setTab("sources")}>{t("Manage sources", "Керувати джерелами")}</button>
            </article>
          </section>

          <div className="module-two-column overview-charts">
            <section className="module-section">
              <div className="section-heading"><div><p className="eyebrow">{t("Monthly trend", "Динаміка за місяцями")}</p><h2>{t("Income vs expenses", "Доходи та витрати")}</h2></div></div>
              {analytics.summaries.length > 0 ? <div className="cashflow-chart">
                {analytics.summaries.map((summary) => {
                  const label = new Intl.DateTimeFormat(intlLocale, { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(Date.UTC(summary.year, summary.month - 1, 1)));
                  const income = asNumber(summary.total_income);
                  const expenses = asNumber(summary.total_expenses);
                  return <div className="cashflow-chart-month" key={`${summary.year}-${summary.month}`}>
                    <div className="cashflow-bars" aria-label={`${label}: ${t("income", "доходи")} ${overviewMoney(income)}, ${t("expenses", "витрати")} ${overviewMoney(expenses)}`}>
                      <span className="income" title={`${t("Income", "Доходи")}: ${overviewMoney(income)}`} style={{ height: `${Math.max(income ? 4 : 0, (income / analytics.chartMaximum) * 100)}%` }} />
                      <span className="expenses" title={`${t("Expenses", "Витрати")}: ${overviewMoney(expenses)}`} style={{ height: `${Math.max(expenses ? 4 : 0, (expenses / analytics.chartMaximum) * 100)}%` }} />
                    </div>
                    <small>{label}</small>
                  </div>;
                })}
              </div> : <EmptyState icon={<TrendingUp size={22} />} title={t("No cash flow yet", "Грошового потоку ще немає")} description={t("Transactions in the selected months will appear here.", "Транзакції за вибрані місяці з’являться тут.")} />}
              <div className="chart-legend"><span className="income">{t("Income", "Доходи")}</span><span className="expenses">{t("Expenses", "Витрати")}</span></div>
            </section>

            <section className="module-section">
              <div className="section-heading"><div><p className="eyebrow">{t("Expense mix", "Структура витрат")}</p><h2>{t("Spending by category", "Витрати за категоріями")}</h2><span className="section-caption">{t("Select a category to view and edit its transactions", "Виберіть категорію, щоб переглянути й редагувати її транзакції")}</span></div></div>
              {analytics.categoryShares.length > 0 ? <div className="category-share-list">{analytics.categoryShares.map((item) => {
                const share = analytics.totalExpenses ? (item.expenses / analytics.totalExpenses) * 100 : 0;
                return <button type="button" className="category-share" onClick={() => setCategoryFilter(item.category)} aria-label={t(`View and edit ${titleCase(item.category)} transactions`, `Переглянути й редагувати транзакції категорії ${titleCase(item.category)}`)} key={item.category}>
                  <div><strong>{titleCase(item.category)}</strong><span>{overviewMoney(item.expenses)} · {Math.round(share)}% →</span></div>
                  <div><span style={{ width: `${share}%` }} /></div>
                </button>;
              })}</div> : <EmptyState icon={<ReceiptText size={22} />} title={t("No expenses yet", "Витрат ще немає")} description={t("Expense categories in the selected months will appear here.", "Категорії витрат за вибрані місяці з’являться тут.")} />}
            </section>
          </div>
          </>
        )
      ) : tab === "cashflow" ? (
        <div id="money-panel-cashflow" role="tabpanel" aria-labelledby="money-tab-cashflow">
          <section className="module-stats module-stats-four" aria-label={t("Monthly cash-flow summary", "Місячний підсумок грошового потоку")}>
            <article className="module-stat"><span className="stat-icon lime"><ArrowUpRight size={18} /></span><p>{t("Income", "Доходи")}</p><strong>{money(asNumber(data.finance.total_income))}</strong><em>{displayPeriod.label}</em></article>
            <article className="module-stat"><span className="stat-icon amber"><ArrowDownRight size={18} /></span><p>{t("Expenses", "Витрати")}</p><strong>{money(asNumber(data.finance.total_expenses))}</strong><em>{visibleTransactions.length} {t("loaded records", "завантажених записів")}</em></article>
            <article className="module-stat featured"><span className="stat-icon forest"><TrendingUp size={18} /></span><p>{t("Net cash flow", "Чистий грошовий потік")}</p><strong className={asNumber(data.finance.net) < 0 ? "negative" : ""}>{money(asNumber(data.finance.net))}</strong><em>{t("Income minus expenses", "Доходи мінус витрати")}</em></article>
            <article className="module-stat"><span className="stat-icon blue"><Target size={18} /></span><p>{t("Budget remaining", "Залишок бюджету")}</p><strong className={hasMonthlyBudget && asNumber(data.finance.budget_remaining) < 0 ? "negative" : ""}>{hasMonthlyBudget ? money(asNumber(data.finance.budget_remaining)) : "—"}</strong><em>{hasMonthlyBudget ? `${money(asNumber(data.finance.total_budget))} ${t("planned", "заплановано")}` : t("No budget set", "Бюджет не задано")}</em></article>
          </section>
          <div className="module-two-column money-layout">
            <section className="module-section budget-module">
              <div className="section-heading"><div><p className="eyebrow">{t("Spending plan", "План витрат")}</p><h2>{t("Monthly budgets", "Місячні бюджети")}</h2></div><button className="section-action" onClick={() => setDialog({ kind: "budget" })}><Plus size={15} /> {t("Add", "Додати")}</button></div>
              {data.budgets.length > 0 ? (
                <div className="budget-module-list">
                  {data.budgets.map((budget) => {
                    const category = data.finance.categories.find((item) => item.category.toLowerCase() === budget.category.toLowerCase());
                    const spent = asNumber(category?.expenses);
                    const limit = asNumber(budget.limit_amount);
                    const percent = Math.min((spent / Math.max(limit, 1)) * 100, 100);
                    return (
                      <div className="budget-module-row" key={budget.id}>
                        <div className="budget-row-top"><div><strong>{titleCase(budget.category)}</strong><span>{money(spent)} {t("of", "з")} {money(limit)}</span></div><div className="record-actions"><button onClick={() => setDialog({ kind: "budget", record: budget })} aria-label={t(`Edit ${budget.category} budget`, `Редагувати бюджет ${budget.category}`)}><Edit3 size={15} /></button><button className="danger" onClick={() => void remove(`/finance/budgets/${budget.id}`, "Budget")} aria-label={t(`Delete ${budget.category} budget`, `Видалити бюджет ${budget.category}`)}><Trash2 size={15} /></button></div></div>
                        <div className="budget-progress"><span className={spent > limit ? "over" : ""} style={{ width: `${percent}%` }} /></div>
                        <small>{spent > limit ? `${money(spent - limit)} ${t("over", "понад бюджет")}` : `${money(limit - spent)} ${t("remaining", "залишилося")}`}</small>
                      </div>
                    );
                  })}
                </div>
              ) : <EmptyState icon={<Target size={22} />} title={t("No budgets for this month", "Цього місяця бюджетів немає")} description={t("Add category limits to turn spending into a plan.", "Додайте ліміти категорій, щоб спланувати витрати.")} action={t("Add budget", "Додати бюджет")} onAction={() => setDialog({ kind: "budget" })} />}
            </section>

            <section className="module-section transaction-module">
              <div className="section-heading">
                <div><p className="eyebrow">{t("Ledger", "Журнал")}</p><h2>{categoryFilter ? t(`${titleCase(categoryFilter)} expenses`, `Витрати: ${titleCase(categoryFilter)}`) : t("Transactions", "Транзакції")}</h2></div>
                <div className="section-heading-actions">
                  {categoryFilter && <button className="section-action" onClick={() => setCategoryFilter(undefined)}>{t("Show all", "Показати всі")}</button>}
                  <label className="include-ignored-toggle"><input type="checkbox" checked={includeIgnored} onChange={(event) => setIncludeIgnored(event.target.checked)} /> {t("Include ignored", "Показати ігноровані")}</label>
                  <span className="record-count">{visibleTransactions.length} {t("records", "записів")}</span>
                  {!categoryFilter && <button
                    className="section-delete-all"
                    disabled={integrationBusy || transactionDeleteTarget !== null || data.monobank.sync_status === "running"}
                    onClick={() => void removeAllTransactions()}
                    aria-label={t("Delete all transactions", "Видалити всі транзакції")}
                  >
                    <Trash2 size={13} /> {t("Delete all", "Видалити всі")}
                  </button>}
                </div>
              </div>
              {visibleTransactions.length > 0 ? (
                <div className="transaction-list">
                  {visibleTransactions.map((transaction) => (
                    <article className={`transaction-row ${transaction.hold ? "pending" : ""} ${transaction.excluded_from_summary ? "excluded" : ""}`} key={transaction.id}>
                      <span className={`transaction-icon ${transaction.kind}`} >{transaction.kind === "income" ? <ArrowUpRight size={17} /> : <ArrowDownRight size={17} />}</span>
                      <div className="record-primary"><h3>{transaction.description || titleCase(transaction.category)}</h3><p>{titleCase(transaction.category)} · {shortDate(transaction.occurred_on, intlLocale)} {transaction.source === "monobank" && <span className="record-badge monobank">Monobank</span>} {isIgnoredTransaction(transaction, data.monobank.accounts) && <span className="record-badge ignored">{t("Ignored source", "Ігнороване джерело")}</span>} {transaction.hold && <span className="record-badge pending">{t("Pending", "Очікує")}</span>} {transaction.excluded_from_summary && <span className="record-badge excluded">{t("Excluded", "Виключено")}</span>}</p></div>
                      <strong className={`transaction-amount ${transaction.kind}`}>{transaction.kind === "expense" ? "−" : "+"}{formatMoney(asNumber(transaction.amount), transaction.currency, intlLocale)}</strong>
                      <div className="record-actions"><button onClick={() => setDialog({ kind: "transaction", record: transaction })} aria-label={transaction.source === "manual" ? t("Edit transaction", "Редагувати транзакцію") : t("Categorize imported bank transaction", "Вибрати категорію імпортованої транзакції")}><Edit3 size={16} /></button>{transaction.source === "manual" && <button className="danger" disabled={transactionDeleteTarget !== null} onClick={() => void removeTransaction(transaction)} aria-label={t("Delete transaction", "Видалити транзакцію")}><Trash2 size={16} /></button>}</div>
                    </article>
                  ))}
                </div>
              ) : categoryFilter
                ? <EmptyState icon={<ReceiptText size={22} />} title={t(`No ${titleCase(categoryFilter)} expenses this month`, `Цього місяця немає витрат у категорії ${titleCase(categoryFilter)}`)} description={t("Try another category or view the full ledger.", "Спробуйте іншу категорію або перегляньте весь журнал.")} action={t("Show all transactions", "Показати всі транзакції")} onAction={() => setCategoryFilter(undefined)} />
                : <EmptyState icon={<ReceiptText size={22} />} title={t("No transactions this month", "Цього місяця транзакцій немає")} description={t("Income and expenses you record will appear here.", "Тут з’являться записані доходи й витрати.")} action={t("Add transaction", "Додати транзакцію")} onAction={() => setDialog({ kind: "transaction" })} />}
            </section>
          </div>
        </div>
      ) : tab === "wealth" ? (
        <>
          <section id="money-panel-wealth" role="tabpanel" aria-labelledby="money-tab-wealth" className="module-stats module-stats-four" aria-label={t("Wealth summary", "Підсумок активів")}>
            <article className="module-stat"><span className="stat-icon lime"><Banknote size={18} /></span><p>{t("Assets", "Активи")}</p><strong>{money(asNumber(data.wealth.assets))}</strong><em>{t("Included accounts", "Враховані рахунки")}</em></article>
            <article className="module-stat"><span className="stat-icon amber"><CreditCard size={18} /></span><p>{t("Liabilities", "Зобов’язання")}</p><strong>{money(asNumber(data.wealth.liabilities))}</strong><em>{t("Included accounts", "Враховані рахунки")}</em></article>
            <article className="module-stat featured"><span className="stat-icon forest"><Landmark size={18} /></span><p>{t("Net worth", "Чисті активи")}</p><strong>{money(asNumber(data.wealth.net_worth))}</strong><em>{t("Assets minus liabilities", "Активи мінус зобов’язання")}</em></article>
            <article className="module-stat"><span className="stat-icon blue"><PiggyBank size={18} /></span><p>{t("Savings", "Заощадження")}</p><strong>{money(asNumber(data.wealth.savings))}</strong><em>{data.accounts.filter((item) => item.is_savings).length} {t("local accounts", "власних рахунків")} · {data.monobank.jars.filter((item) => item.is_tracked && item.currency === currency).length} {t("jars", "банок")}</em></article>
          </section>

          <div className="module-two-column wealth-grid">
            <section className="module-section">
              <div className="section-heading"><div><p className="eyebrow">{t("Balance sheet", "Баланс")}</p><h2>{t("Accounts", "Рахунки")}</h2></div><button className="section-action" onClick={() => setDialog({ kind: "account" })}><Plus size={15} /> {t("Add", "Додати")}</button></div>
              {data.accounts.length > 0 ? <div className="account-list">{data.accounts.map((account) => (
                <article className="account-row" key={account.id}>
                  <span className={`account-icon ${account.account_type}`} >{account.account_type === "asset" ? <CircleDollarSign size={18} /> : <CreditCard size={18} />}</span>
                  <div className="record-primary"><h3>{account.name}</h3><p>{titleCase(account.category)}{account.is_savings ? ` · ${t("Savings", "Заощадження")}` : ""}{!account.include_in_net_worth ? ` · ${t("Excluded", "Виключено")}` : ""}</p></div>
                  <strong className={account.account_type === "liability" ? "negative" : ""}>{account.account_type === "liability" ? "−" : ""}{money(asNumber(account.balance))}</strong>
                  <div className="record-actions"><button onClick={() => setDialog({ kind: "account", record: account })} aria-label={t(`Edit ${account.name}`, `Редагувати ${account.name}`)}><Edit3 size={16} /></button><button className="danger" onClick={() => void remove(`/wealth/accounts/${account.id}`, "Account")} aria-label={t(`Delete ${account.name}`, `Видалити ${account.name}`)}><Trash2 size={16} /></button></div>
                </article>
              ))}</div> : <EmptyState icon={<Landmark size={22} />} title={t("No accounts yet", "Рахунків ще немає")} description={t("Add assets and liabilities to calculate your net worth.", "Додайте активи й зобов’язання, щоб розрахувати чисті активи.")} action={t("Add account", "Додати рахунок")} onAction={() => setDialog({ kind: "account" })} />}
            </section>

            <section className="module-section goals-module">
              <div className="section-heading"><div><p className="eyebrow">{t("Intentional saving", "Цілеспрямовані заощадження")}</p><h2>{t("Savings goals", "Цілі заощаджень")}</h2></div><button className="section-action" onClick={() => setDialog({ kind: "goal" })}><Plus size={15} /> {t("Add", "Додати")}</button></div>
              {data.goals.length > 0 ? <div className="goal-module-list">{data.goals.map((goal) => {
                const progress = Math.min(asNumber(goal.progress_percent), 100);
                return (
                  <article className="goal-module-card" key={goal.id}>
                    <div className="goal-top"><div><h3>{goal.name}</h3><p>{money(asNumber(goal.current_amount))} {t("of", "з")} {money(asNumber(goal.target_amount))}</p></div><strong>{Math.round(progress)}%</strong></div>
                    <div className="goal-progress"><span style={{ width: `${progress}%` }} /></div>
                    <div className="goal-actions"><span>{goal.target_date ? `${t("Target", "Цільова дата")} ${shortDate(goal.target_date, intlLocale)}` : `${money(Math.max(asNumber(goal.target_amount) - asNumber(goal.current_amount), 0))} ${t("to go", "залишилося")}`}</span><button onClick={() => setDialog({ kind: "contribution", goal })}><Plus size={14} /> {t("Activity", "Операція")}</button><button onClick={() => setDialog({ kind: "goal", record: goal })} aria-label={t(`Edit ${goal.name}`, `Редагувати ${goal.name}`)}><Edit3 size={15} /></button><button className="danger" onClick={() => void remove(`/wealth/savings-goals/${goal.id}`, "Savings goal")} aria-label={t(`Delete ${goal.name}`, `Видалити ${goal.name}`)}><Trash2 size={15} /></button></div>
                  </article>
                );
              })}</div> : <EmptyState icon={<PiggyBank size={22} />} title={t("No savings goals", "Цілей заощаджень немає")} description={t("Set a target, then record contributions and withdrawals.", "Встановіть ціль, а потім записуйте внески й зняття.")} action={t("Add savings goal", "Додати ціль")} onAction={() => setDialog({ kind: "goal" })} />}
            </section>
          </div>

          <div className="module-two-column wealth-history-grid">
            <section className="module-section">
              <div className="section-heading"><div><p className="eyebrow">{t("Savings ledger", "Журнал заощаджень")}</p><h2>{t("Goal activity", "Операції за цілями")}</h2></div><span className="record-count">{data.contributions.length} {t("records", "записів")}</span></div>
              {data.contributions.length > 0 ? <div className="compact-record-list">{data.contributions.map((entry) => {
                const goal = data.goals.find((item) => item.id === entry.goal_id);
                if (!goal) return null;
                return (
                  <article className="compact-record" key={entry.id}>
                    <span className={entry.kind === "contribution" ? "positive-badge" : "negative-badge"}>{entry.kind === "contribution" ? <Plus size={14} /> : <Minus size={14} />}</span>
                    <div><strong>{goalsById.get(entry.goal_id) ?? t("Savings goal", "Ціль заощаджень")}</strong><span>{shortDate(entry.occurred_on, intlLocale)}{entry.notes ? ` · ${entry.notes}` : ""}</span></div>
                    <strong className={entry.kind === "withdrawal" ? "negative" : "positive"}>{entry.kind === "withdrawal" ? "−" : "+"}{money(asNumber(entry.amount))}</strong>
                    <div className="record-actions"><button onClick={() => setDialog({ kind: "contribution", goal, record: entry })} aria-label={t("Edit savings activity", "Редагувати операцію заощаджень")}><Edit3 size={15} /></button><button className="danger" onClick={() => void remove(`/wealth/savings-contributions/${entry.id}`, "Savings activity")} aria-label={t("Delete savings activity", "Видалити операцію заощаджень")}><Trash2 size={15} /></button></div>
                  </article>
                );
              })}</div> : <EmptyState icon={<PiggyBank size={22} />} title={t("No activity this month", "Цього місяця операцій немає")} description={t("Contributions and withdrawals for this month appear here.", "Тут з’являться внески й зняття за цей місяць.")} />}
            </section>

            <section className="module-section snapshot-module">
              <div className="section-heading"><div><p className="eyebrow">{t("History", "Історія")}</p><h2>{t("Net-worth snapshots", "Знімки чистих активів")}</h2></div><button className="section-action" onClick={() => void captureSnapshot()}><Camera size={15} /> {t("Capture now", "Створити зараз")}</button></div>
              {data.snapshots.length > 0 ? <div className="snapshot-list">{data.snapshots.slice(0, 6).map((snapshot) => (
                <article className="snapshot-row" key={snapshot.id}>
                  <div><strong>{money(asNumber(snapshot.net_worth))}</strong><span>{shortDate(snapshot.recorded_at, intlLocale)}</span></div>
                  <div className="snapshot-breakdown"><span>{money(asNumber(snapshot.assets))} {t("assets", "активів")}</span><span>{money(asNumber(snapshot.liabilities))} {t("liabilities", "зобов’язань")}</span></div>
                  <button className="icon-danger" onClick={() => void remove(`/wealth/net-worth-snapshots/${snapshot.id}`, "Snapshot")} aria-label={t("Delete snapshot", "Видалити знімок")}><Trash2 size={15} /></button>
                </article>
              ))}</div> : <EmptyState icon={<Camera size={22} />} title={t("No snapshots yet", "Знімків ще немає")} description={t("Capture your current account balances to build net-worth history.", "Збережіть поточні баланси рахунків, щоб побудувати історію чистих активів.")} action={t("Capture now", "Створити зараз")} onAction={() => void captureSnapshot()} />}
            </section>
          </div>
        </>
      ) : (
        <section id="money-panel-sources" role="tabpanel" aria-labelledby="money-tab-sources">
          <section id="money-sources" className={`monobank-panel ${data.monobank.connected ? "connected" : "disconnected"}`} aria-label={t("Monobank integration", "Інтеграція Monobank")}>
            <div className="monobank-heading">
              <span className="monobank-mark"><Landmark size={20} /></span>
              <div>
                <p className="eyebrow">{t("Bank connection", "Підключення банку")}</p>
                <h2>{data.monobank.connected ? data.monobank.client_name : "Monobank"}</h2>
                <p>{data.monobank.connected ? `${t("Last sync", "Остання синхронізація")}: ${dateTime(data.monobank.last_sync_completed_at, intlLocale)}` : t("Connect to discover cards and jars. New sources stay ignored until you track them.", "Підключіться, щоб знайти картки й банки. Нові джерела ігноруються, доки ви не почнете їх відстежувати.")}</p>
              </div>
              {data.monobank.connected ? (
                <span className={`connection-badge ${data.monobank.sync_status ?? "idle"}`}><span /> {data.monobank.sync_status === "running" ? t("Syncing", "Синхронізація") : t("Connected", "Підключено")}</span>
              ) : (
                <button className="monobank-connect-button" onClick={() => setDialog({ kind: "monobank-connect" })}><Link2 size={16} /> {t("Connect Monobank", "Підключити Monobank")}</button>
              )}
            </div>

            {data.monobank.connected && <>
              <div className="monobank-actions">
                <div>
                  <span>{trackedMonobankAccountCount} {t("of", "з")} {data.monobank.accounts.length} {t("cards tracked", "карток відстежується")}</span>
                  <span>{trackedMonobankJarCount} {t("of", "з")} {data.monobank.jars.length} {t("jars tracked", "банок відстежується")}</span>
                  <span>{t("Read-only bank data", "Банківські дані лише для читання")}</span>
                </div>
                <button className="quiet-danger-button" disabled={integrationBusy || monobankTrackingBusy || transactionDeleteTarget !== null} onClick={() => void removeMonobankConnection()}><Unplug size={15} /> {t("Disconnect", "Відключити")}</button>
              </div>

              <div className="monobank-sync-controls">
                <div className="monobank-sync-range">
                  <label><span>{t("From", "Від")}</span><input type="date" value={monobankSyncDateFrom} max={monobankSyncDateTo} disabled={integrationBusy || data.monobank.sync_status === "running"} onChange={(event) => setMonobankSyncDateFrom(event.target.value)} /></label>
                  <label><span>{t("To", "До")}</span><input type="date" value={monobankSyncDateTo} min={monobankSyncDateFrom} max={today} disabled={integrationBusy || data.monobank.sync_status === "running"} onChange={(event) => setMonobankSyncDateTo(event.target.value)} /></label>
                  <button className="secondary-button" disabled={integrationBusy || monobankTrackingBusy || transactionDeleteTarget !== null || data.monobank.sync_status === "running" || trackedMonobankAccountCount === 0 || !monobankSyncDateFrom || !monobankSyncDateTo} onClick={() => void syncMonobank()}><RefreshCw size={15} className={data.monobank.sync_status === "running" ? "spin" : ""} /> {data.monobank.sync_status === "running" ? t("Syncing…", "Синхронізація…") : t("Sync tracked cards", "Синхронізувати картки")}</button>
                </div>
                <p>{trackedMonobankAccountCount === 0 ? t("Track at least one card below before syncing. ", "Перед синхронізацією почніть відстежувати хоча б одну картку. ") : ""}{t("Tracked cards are synced and included in money totals. Tracked jars are included in wealth and savings.", "Відстежувані картки синхронізуються й входять до фінансових підсумків. Відстежувані банки входять до активів і заощаджень.")}</p>
              </div>

              {data.monobank.sync_status === "running" && <div className="monobank-sync-progress" role="status">
                <div><span><CloudDownload size={15} /> {t("Importing statement batch", "Імпортуємо частину виписки")} {Math.min(data.monobank.sync_progress_current + 1, Math.max(data.monobank.sync_progress_total, 1))} {t("of", "з")} {data.monobank.sync_progress_total}</span><strong>{data.monobank.sync_progress_current}/{data.monobank.sync_progress_total}</strong></div>
                <div className="sync-progress-track"><span style={{ width: `${data.monobank.sync_progress_total ? Math.min((data.monobank.sync_progress_current / data.monobank.sync_progress_total) * 100, 100) : 0}%` }} /></div>
                <p>{data.monobank.sync_date_from && data.monobank.sync_date_to ? `${data.monobank.sync_date_from} – ${data.monobank.sync_date_to}. ` : ""}{t("Monobank rate limits statement requests, so larger syncs can take several minutes.", "Monobank обмежує частоту запитів виписки, тому велика синхронізація може тривати кілька хвилин.")}</p>
              </div>}
              {data.monobank.sync_status === "failed" && data.monobank.sync_error && <div className="monobank-error" role="alert"><CircleAlert size={16} /><span>{data.monobank.sync_error}</span></div>}
            </>}
          </section>

          {data.monobank.connected && <div className="source-groups">{[
            { id: "tracked", title: t("Tracked sources", "Відстежувані джерела"), description: t("Included in balances and analytics", "Входять до балансів і аналітики"), sources: trackedSources, expanded: showAllTracked, toggle: () => setShowAllTracked((value) => !value) },
            { id: "ignored", title: t("Ignored sources", "Ігноровані джерела"), description: t("Retained for management, excluded everywhere else", "Збережені для керування, але виключені з інших розділів"), sources: ignoredSources, expanded: showAllIgnored, toggle: () => setShowAllIgnored((value) => !value) },
          ].map((group) => <section className="module-section source-group" key={group.id}>
            <div className="section-heading"><div><p className="eyebrow">{group.description}</p><h2>{group.title}</h2></div><span className="record-count">{group.sources.length}</span></div>
            {group.sources.length > 0 ? <div id={`source-list-${group.id}`} className="source-list">{(group.expanded ? group.sources : group.sources.slice(0, 3)).map((source) => {
              const sourceName = source.kind === "account" ? source.item.masked_pan[0] ?? titleCase(source.item.card_type) : source.item.title;
              const sourceDetail = source.kind === "account" ? `${titleCase(source.item.card_type)} · ${source.item.currency}` : `${t("Jar", "Банка")} · ${source.item.currency}`;
              return <article className="source-row" key={`${source.kind}-${source.item.id}`}>
                <span className="source-icon">{source.kind === "account" ? <CreditCard size={17} /> : <PiggyBank size={17} />}</span>
                <div className="record-primary"><h3>{sourceName}</h3><p>{sourceDetail}</p></div>
                <strong className={asNumber(source.item.balance) < 0 ? "negative" : ""}>{formatMoney(asNumber(source.item.balance), source.item.currency, intlLocale)}</strong>
                <label className="source-tracking-toggle">
                  <input type="checkbox" checked={source.item.is_tracked} disabled={integrationBusy || data.monobank.sync_status === "running" || monobankTrackingSourceIds.has(source.item.id)} onChange={(event) => source.kind === "account" ? void setMonobankAccountTracking(source.item, event.target.checked) : void setMonobankJarTracking(source.item, event.target.checked)} />
                  <span>{source.item.is_tracked ? t("Tracked", "Відстежується") : t("Ignored", "Ігнорується")}</span>
                </label>
                {source.kind === "account" && <button className="monobank-delete-transactions" disabled={integrationBusy || transactionDeleteTarget !== null || data.monobank.sync_status === "running"} onClick={() => void removeMonobankTransactions(source.item)}><Trash2 size={13} /> {t("Delete imports", "Видалити імпорт")}</button>}
              </article>;
            })}</div> : <EmptyState icon={group.id === "tracked" ? <ShieldCheck size={22} /> : <CircleAlert size={22} />} title={group.id === "tracked" ? t("No tracked sources", "Немає відстежуваних джерел") : t("No ignored sources", "Немає ігнорованих джерел")} description={group.id === "tracked" ? t("Move a card or jar here to include it.", "Перемістіть сюди картку або банку, щоб враховувати її.") : t("Every discovered source is currently tracked.", "Усі знайдені джерела зараз відстежуються.")} />}
            {group.sources.length > 3 && <button className="source-expand" aria-expanded={group.expanded} aria-controls={`source-list-${group.id}`} onClick={group.toggle}>{group.expanded ? t("Show less", "Показати менше") : t(`Show all ${group.sources.length}`, `Показати всі (${group.sources.length})`)}</button>}
          </section>)}</div>}
        </section>
      )}
        </div>
      )}

      <ModuleDialog open={dialog !== null} title={dialogTitle} eyebrow={t("Money", "Фінанси")} saving={saving} onClose={closeDialog}>
        {dialog?.kind === "transaction" && <form className="log-form" onSubmit={saveTransaction} key={dialog.record?.id ?? "new-transaction"}>
          {dialog.record?.source !== undefined && dialog.record.source !== "manual" ? (
            <>
              <div className="dialog-note monobank-note"><ShieldCheck size={16} /><span>{t("Bank amount, date, type, currency, and description are read-only. Your category and exclusion choice remain unchanged after future syncs.", "Сума, дата, тип, валюта й опис банку доступні лише для читання. Категорія та виключення збережуться після майбутніх синхронізацій.")}</span></div>
              <div className="monobank-readonly-transaction">
                <div><span>{t("Description", "Опис")}</span><strong>{dialog.record.description || t("Bank transaction", "Банківська транзакція")}</strong></div>
                <div><span>{t("Amount", "Сума")}</span><strong>{dialog.record.kind === "expense" ? "−" : "+"}{formatMoney(asNumber(dialog.record.amount), dialog.record.currency, intlLocale)}</strong></div>
                <div><span>{t("Date", "Дата")}</span><strong>{shortDate(dialog.record.occurred_on, intlLocale)}</strong></div>
                <div><span>{t("Status", "Статус")}</span><strong>{dialog.record.hold ? t("Pending", "Очікує") : t("Booked", "Проведено")}</strong></div>
              </div>
              <label><span>{t("Category", "Категорія")}</span><input name="category" maxLength={100} defaultValue={dialog.record.category} placeholder={t("Food", "Їжа")} required /></label>
              <div className="checkbox-stack"><label><input name="excluded_from_summary" type="checkbox" defaultChecked={dialog.record.excluded_from_summary} /><span><strong>{t("Exclude from summaries", "Виключити з підсумків")}</strong><small>{t("Keep the transaction in the ledger without counting it in cash-flow totals.", "Залишити транзакцію в журналі, але не враховувати в підсумках грошового потоку.")}</small></span></label></div>
            </>
          ) : (
            <>
              <div className="form-grid"><label><span>{t("Type", "Тип")}</span><select name="kind" defaultValue={dialog.record?.kind ?? "expense"}><option value="expense">{t("Expense", "Витрата")}</option><option value="income">{t("Income", "Дохід")}</option></select></label><label><span>{t("Date", "Дата")}</span><input name="occurred_on" type="date" min={dialog.record ? undefined : period.startDate} max={dialog.record ? undefined : period.endDate} defaultValue={dialog.record?.occurred_on ?? period.referenceDate} required /></label></div>
              <div className="form-grid"><label><span>{t("Amount", "Сума")}</span><div className="input-unit"><input name="amount" type="number" min="0.01" step="0.01" defaultValue={dialog.record ? asNumber(dialog.record.amount) : ""} placeholder="45.00" required /><em>{dialogCurrency}</em></div></label><label><span>{t("Category", "Категорія")}</span><input name="category" maxLength={100} defaultValue={dialog.record?.category ?? categoryFilter ?? ""} placeholder={t("Food", "Їжа")} required /></label></div>
              <label><span>{t("Description", "Опис")}</span><input name="description" maxLength={500} defaultValue={dialog.record?.description ?? ""} placeholder={t("What was this for?", "На що це було?")} /></label>
              <div className="checkbox-stack"><label><input name="excluded_from_summary" type="checkbox" defaultChecked={dialog.record?.excluded_from_summary ?? false} /><span><strong>{t("Exclude from summaries", "Виключити з підсумків")}</strong><small>{t("Keep this entry in the ledger without counting it in cash-flow totals.", "Залишити запис у журналі, але не враховувати в підсумках грошового потоку.")}</small></span></label></div>
            </>
          )}
          <SaveActions saving={saving} onCancel={closeDialog} label={dialog.record ? t("Save changes", "Зберегти зміни") : t("Add transaction", "Додати транзакцію")} />
        </form>}

        {dialog?.kind === "budget" && <form className="log-form" onSubmit={saveBudget} key={dialog.record?.id ?? "new-budget"}>
          <div className="dialog-note"><Target size={16} /><span>{t(`This budget applies to ${period.label}. Match its category spelling to your transactions.`, `Цей бюджет діє для ${period.label}. Назва категорії має збігатися з транзакціями.`)}</span></div>
          <label><span>{t("Category", "Категорія")}</span><input name="category" maxLength={100} defaultValue={dialog.record?.category ?? ""} placeholder={t("Food", "Їжа")} required /></label>
          <label><span>{t("Monthly limit", "Місячний ліміт")}</span><div className="input-unit"><input name="limit_amount" type="number" min="0.01" step="0.01" defaultValue={dialog.record ? asNumber(dialog.record.limit_amount) : ""} placeholder="600" required /><em>{dialogCurrency}</em></div></label>
          <SaveActions saving={saving} onCancel={closeDialog} label={dialog.record ? t("Save changes", "Зберегти зміни") : t("Add budget", "Додати бюджет")} />
        </form>}

        {dialog?.kind === "account" && <form className="log-form" onSubmit={saveAccount} key={dialog.record?.id ?? "new-account"}>
          <label><span>{t("Account name", "Назва рахунку")}</span><input name="name" maxLength={120} defaultValue={dialog.record?.name ?? ""} placeholder={t("Main checking", "Основний рахунок")} required /></label>
          <div className="form-grid"><label><span>{t("Type", "Тип")}</span><select name="account_type" defaultValue={dialog.record?.account_type ?? "asset"}><option value="asset">{t("Asset", "Актив")}</option><option value="liability">{t("Liability", "Зобов’язання")}</option></select></label><label><span>{t("Category", "Категорія")}</span><input name="category" maxLength={80} defaultValue={dialog.record?.category ?? ""} placeholder={t("Cash, loan, investment…", "Готівка, кредит, інвестиції…")} required /></label></div>
          <label><span>{t("Current balance", "Поточний баланс")}</span><div className="input-unit"><input name="balance" type="number" min="0" step="0.01" defaultValue={dialog.record ? asNumber(dialog.record.balance) : ""} placeholder="2500" required /><em>{dialogCurrency}</em></div></label>
          <div className="checkbox-stack"><label><input name="include_in_net_worth" type="checkbox" defaultChecked={dialog.record?.include_in_net_worth ?? true} /><span><strong>{t("Include in net worth", "Враховувати в чистих активах")}</strong><small>{t("Use this balance in wealth totals and snapshots.", "Використовувати цей баланс у підсумках і знімках активів.")}</small></span></label><label><input name="is_savings" type="checkbox" defaultChecked={dialog.record?.is_savings ?? false} /><span><strong>{t("Mark as savings", "Позначити як заощадження")}</strong><small>{t("Include this asset in the savings total.", "Враховувати цей актив у сумі заощаджень.")}</small></span></label></div>
          <SaveActions saving={saving} onCancel={closeDialog} label={dialog.record ? t("Save changes", "Зберегти зміни") : t("Add account", "Додати рахунок")} />
        </form>}

        {dialog?.kind === "goal" && <form className="log-form" onSubmit={saveGoal} key={dialog.record?.id ?? "new-goal"}>
          <label><span>{t("Goal name", "Назва цілі")}</span><input name="name" maxLength={120} defaultValue={dialog.record?.name ?? ""} placeholder={t("Emergency fund", "Резервний фонд")} required /></label>
          <div className="form-grid"><label><span>{t("Target amount", "Сума цілі")}</span><div className="input-unit"><input name="target_amount" type="number" min="0.01" step="0.01" defaultValue={dialog.record ? asNumber(dialog.record.target_amount) : ""} placeholder="12000" required /><em>{dialogCurrency}</em></div></label>{!dialog.record && <label><span>{t("Already saved", "Уже заощаджено")}</span><div className="input-unit"><input name="current_amount" type="number" min="0" step="0.01" defaultValue="0" /><em>{dialogCurrency}</em></div></label>}</div>
          <label><span>{t("Target date (optional)", "Цільова дата (необов’язково)")}</span><input name="target_date" type="date" defaultValue={dialog.record?.target_date ?? ""} /></label>
          <label><span>{t("Notes", "Примітки")}</span><textarea name="notes" rows={3} maxLength={500} defaultValue={dialog.record?.notes ?? ""} placeholder={t("What this goal makes possible", "Що дасть вам ця ціль")} /></label>
          <SaveActions saving={saving} onCancel={closeDialog} label={dialog.record ? t("Save changes", "Зберегти зміни") : t("Add goal", "Додати ціль")} />
        </form>}

        {dialog?.kind === "contribution" && <form className="log-form" onSubmit={saveContribution} key={dialog.record?.id ?? `new-${dialog.goal.id}`}>
          <div className="dialog-note"><PiggyBank size={16} /><span>{t("Recording activity for", "Операція для")} <strong>{dialog.goal.name}</strong>.</span></div>
          <div className="form-grid"><label><span>{t("Activity", "Операція")}</span><select name="kind" defaultValue={dialog.record?.kind ?? "contribution"}><option value="contribution">{t("Contribution", "Внесок")}</option><option value="withdrawal">{t("Withdrawal", "Зняття")}</option></select></label><label><span>{t("Date", "Дата")}</span><input name="occurred_on" type="date" min={period.startDate} max={period.endDate} defaultValue={dialog.record?.occurred_on ?? period.referenceDate} required /></label></div>
          <label><span>{t("Amount", "Сума")}</span><div className="input-unit"><input name="amount" type="number" min="0.01" step="0.01" defaultValue={dialog.record ? asNumber(dialog.record.amount) : ""} placeholder="250" required /><em>{dialogCurrency}</em></div></label>
          <label><span>{t("Notes", "Примітки")}</span><input name="notes" maxLength={500} defaultValue={dialog.record?.notes ?? ""} placeholder={t("Payday transfer", "Переказ із зарплати")} /></label>
          <SaveActions saving={saving} onCancel={closeDialog} label={dialog.record ? t("Save changes", "Зберегти зміни") : t("Add activity", "Додати операцію")} />
        </form>}

        {dialog?.kind === "monobank-connect" && <form className="log-form monobank-connect-form" onSubmit={saveMonobankConnection}>
          <div className="dialog-note monobank-note"><ShieldCheck size={17} /><span>{t("Your personal token is sent directly to the Better Tracker backend over this connection, encrypted with Fernet, and never returned to the browser after connect.", "Ваш особистий токен надсилається безпосередньо на сервер Better Tracker, шифрується за допомогою Fernet і після підключення не повертається до браузера.")}</span></div>
          <label><span>{t("Personal API token", "Особистий API-токен")}</span><input name="monobank_token" type="password" autoComplete="off" spellCheck={false} placeholder={t("Paste your Monobank token", "Вставте токен Monobank")} required /></label>
          <p className="field-help">{t("Create a personal token in the official Monobank API cabinet. Use Better Tracker over HTTPS outside local development.", "Створіть особистий токен в офіційному кабінеті API Monobank. Поза локальною розробкою використовуйте Better Tracker через HTTPS.")}</p>
          <div className="connection-scope"><strong>{t("Read-only import", "Імпорт лише для читання")}</strong><span>{t("Client name, cards, balances, credit limits, jars, and a user-selected statement period (one month by default). No payments, webhooks, or scheduled sync.", "Імпортуються ім’я клієнта, картки, баланси, кредитні ліміти, банки та вибраний період виписки (типово один місяць). Без платежів, вебхуків і планової синхронізації.")}</span></div>
          <SaveActions saving={saving} onCancel={closeDialog} label={t("Connect securely", "Безпечно підключити")} />
        </form>}

      </ModuleDialog>
      {toast && <ModuleToast {...toast} onClose={() => setToast(null)} />}
    </>
  );
}
