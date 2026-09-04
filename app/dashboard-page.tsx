"use client";

import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Dumbbell,
  Flame,
  LayoutDashboard,
  PiggyBank,
  Plus,
  ReceiptText,
  RotateCcw,
  Scale,
  Sparkles,
  Target,
  TrendingUp,
  Utensils,
  WalletCards,
  X,
  Zap,
} from "lucide-react";
import Link from "next/link";
import {
  type CSSProperties,
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { AccountSummary } from "@/components/account-summary";
import type { AuthUser } from "@/lib/auth";
import { LocaleProvider, useLocale } from "@/lib/i18n";
import {
  createQuickLog,
  type Activity,
  type DashboardData,
  fetchDashboard,
  formatMoney,
  getPeriod,
  getPeriodOptions,
  type LogType,
  type UndoAction,
  undoQuickLog,
} from "@/lib/tracker-api";

const navigation = [
  { label: "Overview", uk: "Огляд", icon: LayoutDashboard, href: "/" },
  { label: "Money", uk: "Фінанси", icon: WalletCards, href: "/money" },
  { label: "Training", uk: "Тренування", icon: Dumbbell, href: "/training" },
  { label: "Nutrition", uk: "Харчування", icon: Utensils, href: "/nutrition" },
  { label: "Body", uk: "Тіло", icon: Scale, href: "/body" },
];

const logTypes: { label: LogType; icon: typeof ReceiptText }[] = [
  { label: "Expense", icon: ReceiptText },
  { label: "Income", icon: CircleDollarSign },
  { label: "Workout", icon: Dumbbell },
  { label: "Meal", icon: Utensils },
  { label: "Weight", icon: Scale },
  { label: "Savings", icon: PiggyBank },
];

type ToastState = {
  message: string;
  tone: "success" | "error" | "info";
  undo?: UndoAction;
};

function formatCompact(value: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale, {
    notation: "compact",
    style: "currency",
    currency,
    maximumFractionDigits: 1,
  }).format(value);
}

function formatLongDate(date: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

function formatShortDate(date: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

function formatDuration(minutes: number, ukrainian: boolean): string {
  if (minutes < 60) return `${minutes}${ukrainian ? "хв" : "m"}`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0
    ? `${hours}${ukrainian ? "год" : "h"} ${remainder}${ukrainian ? "хв" : "m"}`
    : `${hours}${ukrainian ? "год" : "h"}`;
}

function getWeekDays(referenceDate: string, ukrainian: boolean) {
  const reference = new Date(`${referenceDate}T12:00:00Z`);
  const mondayOffset = (reference.getUTCDay() + 6) % 7;
  const monday = new Date(reference);
  monday.setUTCDate(reference.getUTCDate() - mondayOffset);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setUTCDate(monday.getUTCDate() + index);
    return {
      key: date.toISOString().slice(0, 10),
      day: (ukrainian ? ["Н", "П", "В", "С", "Ч", "П", "С"] : ["S", "M", "T", "W", "T", "F", "S"])[date.getUTCDay()],
      date: String(date.getUTCDate()),
    };
  });
}

function buildWeightChart(weights: DashboardData["health"]["weights"]) {
  if (weights.length === 0) return null;
  const values = weights.map((item) => item.value);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = Math.max(maximum - minimum, 1);
  const points = weights.length === 1
    ? [
      { x: 0, y: 45 },
      { x: 360, y: 45 },
    ]
    : weights.map((item, index) => ({
      x: (index / (weights.length - 1)) * 360,
      y: 12 + ((maximum - item.value) / range) * 58,
    }));
  const line = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`)
    .join(" ");
  const last = points.at(-1) ?? { x: 360, y: 45 };
  return {
    line,
    area: `${line} L360,90 L0,90 Z`,
    last,
    minimum,
    maximum,
  };
}

function IconBadge({ kind, tone }: { kind: LogType; tone: Activity["tone"] }) {
  const found = logTypes.find((item) => item.label === kind);
  const Icon = found?.icon ?? Sparkles;
  return (
    <span className={`activity-icon ${tone}`} aria-hidden="true">
      <Icon size={17} strokeWidth={2} />
    </span>
  );
}

function BrandMark() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path d="M7 22.5 12.2 16.9 16.5 19.2 24 10.5" />
      <path d="M20 10.5h4v4" />
      <circle cx="7" cy="22.5" r="1.35" />
      <circle cx="12.2" cy="16.9" r="1.35" />
      <circle cx="16.5" cy="19.2" r="1.35" />
    </svg>
  );
}

function DashboardState({
  error,
  onRetry,
}: {
  error: string | null;
  onRetry: () => void;
}) {
  const { t } = useLocale();
  return (
    <section className={`dashboard-state ${error ? "error" : "loading"}`} role={error ? "alert" : "status"}>
      <span className="state-icon">
        {error ? <X size={20} /> : <RotateCcw size={20} />}
      </span>
      <div>
        <h2>{error ? t("The backend could not be loaded", "Не вдалося завантажити дані із сервера") : t("Loading your live data", "Завантажуємо ваші дані")}</h2>
        <p>{error ?? t("Fetching money, training, health, and wealth records…", "Отримуємо дані про фінанси, тренування, здоров’я та активи…")}</p>
      </div>
      {error && <button onClick={onRetry}>{t("Try again", "Спробувати ще раз")}</button>}
    </section>
  );
}

function LocalizedDashboardPage({ user, initialCurrency }: { user: AuthUser; initialCurrency: string }) {
  const { locale, intlLocale, t } = useLocale();
  const periodOptions = useMemo(() => getPeriodOptions(12, new Date(), intlLocale), [intlLocale]);
  const [periodKey, setPeriodKey] = useState(() => getPeriodOptions()[0].key);
  const [currencyKey, setCurrencyKey] = useState(initialCurrency);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [logType, setLogType] = useState<LogType>("Expense");
  const [defaultCategory, setDefaultCategory] = useState("Food");
  const [toast, setToast] = useState<ToastState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const dialogRef = useRef<HTMLElement | null>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  const rawPeriod = dashboard?.period ?? getPeriod(periodKey);
  const selectedPeriod = { ...rawPeriod, label: getPeriod(rawPeriod.key, new Date(), intlLocale).label };
  const currency = dashboard?.currency ?? currencyKey;
  const dashboardStale = dashboard !== null && (dashboard.period.key !== periodKey || dashboard.currency !== currencyKey);
  const currencies = Array.from(new Set([currencyKey, ...(dashboard?.currencies ?? [])]));
  const money = (value: number) => formatMoney(value, currency, intlLocale);
  const logLabel = (type: LogType) => t(type === "Meal" ? "Daily nutrition" : type, ({ Expense: "Витрата", Income: "Дохід", Workout: "Тренування", Meal: "Харчування за день", Weight: "Вага", Savings: "Заощадження" })[type]);
  const areaLabel = (area: string) => ({ Money: "Фінанси", Training: "Тренування", Nutrition: "Харчування", Body: "Тіло", Savings: "Заощадження" })[area] ?? area;

  useEffect(() => {
    const controller = new AbortController();
    void fetchDashboard(periodKey, controller.signal, intlLocale, currencyKey)
      .then((data) => {
        setDashboard(data);
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLoadError(error instanceof Error ? error.message : t("The backend request failed.", "Помилка запиту до сервера."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [currencyKey, intlLocale, periodKey, refreshVersion, t]);

  useEffect(() => {
    if (!dialogOpen) return;
    const background = Array.from(
      document.querySelectorAll<HTMLElement>(".sidebar, .mobile-header, .main-content, .mobile-nav"),
    );
    background.forEach((element) => { element.inert = true; });
    const focusTimer = window.setTimeout(() => {
      dialogRef.current?.querySelector<HTMLElement>("input, select")?.focus();
    }, 0);
    const handleDialogKeys = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) {
        setDialogOpen(false);
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])",
      ));
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener("keydown", handleDialogKeys);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleDialogKeys);
      background.forEach((element) => { element.inert = false; });
      lastFocusedRef.current?.focus();
    };
  }, [dialogOpen, saving]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const refreshData = () => {
    setLoading(true);
    setLoadError(null);
    setRefreshVersion((value) => value + 1);
  };

  const changePeriod = (nextPeriod: string) => {
    setPeriodKey(nextPeriod);
    setLoading(true);
    setLoadError(null);
    setToast({ message: `${t("Loading", "Завантажуємо")} ${getPeriod(nextPeriod, new Date(), intlLocale).label}`, tone: "info" });
  };

  const changeCurrency = (nextCurrency: string) => {
    setCurrencyKey(nextCurrency);
    setLoading(true);
    setLoadError(null);
  };

  const openLog = (type: LogType = "Expense", category = "Food") => {
    if (!dashboard || dashboardStale) return;
    lastFocusedRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    setLogType(type);
    setDefaultCategory(category);
    setDialogOpen(true);
  };

  const handleLog = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const optionalNumber = (name: string) => {
      const raw = String(form.get(name) ?? "").trim();
      return raw === "" ? undefined : Number(raw);
    };
    const description = String(form.get("description") ?? "").trim();
    const value = optionalNumber("value") ?? 0;

    setSaving(true);
    try {
      const undo = await createQuickLog({
        type: logType,
        description,
        date: String(form.get("date") || selectedPeriod.referenceDate),
        value,
        duration: optionalNumber("duration"),
        protein: optionalNumber("protein"),
        calorieTarget: optionalNumber("calorieTarget"),
        category: String(form.get("category") || "General"),
        goalId: String(form.get("goalId") || "") || undefined,
        newGoalName: String(form.get("newGoalName") || "").trim() || undefined,
        newGoalTarget: optionalNumber("newGoalTarget"),
        currency: currencyKey,
      });
      setDialogOpen(false);
      setToast({ message: t(`${logType} saved to the backend`, `${logLabel(logType)} збережено`), tone: "success", undo });
      setLoading(true);
      setRefreshVersion((current) => current + 1);
    } catch (error) {
      setToast({
        message: error instanceof Error ? error.message : t(`Could not save ${logType.toLowerCase()}.`, `Не вдалося зберегти: ${logLabel(logType).toLowerCase()}.`),
        tone: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const undoLastLog = async () => {
    if (!toast?.undo || undoing) return;
    setUndoing(true);
    try {
      await undoQuickLog(toast.undo);
      setToast({ message: t("The backend entry was undone", "Запис скасовано"), tone: "success" });
      setLoading(true);
      setRefreshVersion((current) => current + 1);
    } catch (error) {
      setToast({
        message: error instanceof Error ? error.message : t("Could not undo the backend entry.", "Не вдалося скасувати запис."),
        tone: "error",
      });
    } finally {
      setUndoing(false);
    }
  };

  const focusBudget = dashboard?.finance.totalBudget ?? 0;
  const focusSpent = dashboard?.finance.spent ?? 0;
  const focusPercent = focusBudget > 0
    ? Math.min(Math.round((focusSpent / focusBudget) * 100), 100)
    : 0;
  const categoryOptions = Array.from(new Set([
    defaultCategory,
    ...(dashboard?.finance.categories.map((category) => category.name) ?? []),
    "Housing",
    "Food",
    "Transport",
    "Lifestyle",
    "Other",
  ]));

  const weekDays = getWeekDays(selectedPeriod.referenceDate, locale === "uk");
  const completedWorkoutDates = new Set(dashboard?.training.workoutDates ?? []);
  const weightChart = buildWeightChart(dashboard?.health.weights ?? []);
  const calorieTarget = dashboard?.health.calorieTarget ?? null;
  const calories = dashboard?.health.calories ?? 0;
  const caloriesLeft = calorieTarget === null ? null : Math.max(calorieTarget - calories, 0);
  const protein = dashboard?.health.protein ?? 0;
  const proteinShare = calories > 0 ? Math.min(Math.round(((protein * 4) / calories) * 100), 100) : 0;
  const totalGoalCurrent = dashboard?.goals.reduce((total, goal) => total + goal.current, 0) ?? 0;
  const totalGoalTarget = dashboard?.goals.reduce((total, goal) => total + goal.target, 0) ?? 0;
  const savingsGoals = dashboard?.goals ?? [];

  const worthValues = dashboard?.wealth.points.map((point) => point.value) ?? [];
  const worthMinimum = worthValues.length > 0 ? Math.min(...worthValues) : 0;
  const worthMaximum = worthValues.length > 0 ? Math.max(...worthValues) : 0;
  const worthRange = Math.max(worthMaximum - worthMinimum, 1);
  const worthBarHeights = worthValues.map((value) => (
    worthValues.length === 1 ? 88 : 28 + ((value - worthMinimum) / worthRange) * 104
  ));

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">{t("Skip to dashboard", "Перейти до панелі")}</a>
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label={t("Better Tracker home", "Головна Better Tracker")}>
          <span className="brand-mark"><BrandMark /></span>
          <span className="brand-wordmark">BETTER TRACKER</span>
        </Link>

        <nav className="sidebar-nav" aria-label={t("Primary navigation", "Основна навігація")}>
          <p className="nav-eyebrow">{t("Workspace", "Робочий простір")}</p>
          {navigation.map(({ label, uk, icon: Icon, href }) => (
            <Link
              className={href === "/" ? "nav-item active" : "nav-item"}
              key={label}
              href={href}
              aria-label={t(label, uk)}
              title={t(label, uk)}
              aria-current={href === "/" ? "page" : undefined}
            >
              <Icon size={19} strokeWidth={1.9} />
              <span>{t(label, uk)}</span>
              {href === "/" && <span className="nav-dot" />}
            </Link>
          ))}
        </nav>

        <div className="sidebar-focus">
          <div className="focus-heading">
            <span><Target size={16} /> {selectedPeriod.label.split(" ")[0]} {t("budget", "бюджет")}</span>
            <span className="focus-percent">{focusBudget > 0 ? `${focusPercent}%` : "—"}</span>
          </div>
          <p>{focusBudget > 0 ? t("Keep monthly spending inside your plan.", "Дотримуйтеся місячного плану витрат.") : t("Add category budgets to see your monthly plan.", "Додайте бюджети категорій, щоб побачити місячний план.")}</p>
          <div className="focus-bar"><span style={{ width: `${focusPercent}%` }} /></div>
          <div className="focus-meta">
            <span>{money(focusSpent)} {t("spent", "витрачено")}</span>
            <span>{focusBudget > 0 ? money(focusBudget) : t("No budget", "Без бюджету")}</span>
          </div>
        </div>

        <AccountSummary user={user} />
      </aside>

      <header className="mobile-header">
        <Link className="brand" href="/" aria-label={t("Better Tracker home", "Головна Better Tracker")}>
          <span className="brand-mark"><BrandMark /></span>
          <span className="brand-wordmark">BETTER TRACKER</span>
        </Link>
        <div className="mobile-header-actions">
          <AccountSummary user={user} compact />
        </div>
      </header>

      <main className="main-content" id="main-content" aria-busy={loading}>
        <header className="dashboard-header">
          <div>
            <div className="date-line">
              <CalendarDays size={15} />
              {selectedPeriod.isCurrent ? formatLongDate(selectedPeriod.referenceDate, intlLocale) : `${t("Review", "Огляд")}: ${selectedPeriod.label}`}
            </div>
            <h1>{t("Your life, in one view.", "Усе ваше життя — одним поглядом.")}</h1>
            <p>{dashboard
              ? t(`Live backend data across ${dashboard.coverage.tracked.length} of 5 tracking areas.`, `Актуальні дані у ${dashboard.coverage.tracked.length} із 5 сфер.`)
              : t("Connecting to your Better Tracker backend.", "Підключаємося до сервера Better Tracker.")}</p>
          </div>
          <div className="header-actions">
            <label className="currency-picker dashboard-currency-picker">
              <span>{t("Currency", "Валюта")}</span>
              <select value={currencyKey} onChange={(event) => changeCurrency(event.target.value)} aria-label={t("Select dashboard currency", "Виберіть валюту панелі")}>
                {currencies.map((item) => <option value={item} key={item}>{item}</option>)}
              </select>
            </label>
            <label className="month-picker">
              <span className="sr-only">{t("Select month", "Виберіть місяць")}</span>
              <select value={periodKey} onChange={(event) => changePeriod(event.target.value)}>
                {periodOptions.map((period) => <option value={period.key} key={period.key}>{period.label}</option>)}
              </select>
              <ChevronDown size={15} aria-hidden="true" />
            </label>
            <button className="quick-log-button" onClick={() => openLog()} disabled={!dashboard || dashboardStale}><Plus size={18} /> {t("Quick log", "Швидкий запис")}</button>
          </div>
        </header>

        {loadError && dashboard && (
          <div className="data-banner error" role="alert">
            <span>{loadError}</span><button onClick={refreshData}>{t("Retry", "Повторити")}</button>
          </div>
        )}
        {loading && dashboard && (
          <div className="data-banner loading" role="status"><RotateCcw size={14} className="spin" /> {t("Refreshing backend data…", "Оновлюємо дані…")}</div>
        )}

        {!dashboard ? (
          <DashboardState error={loadError} onRetry={refreshData} />
        ) : (
          <div className={`refresh-surface ${loading || dashboardStale ? "is-refreshing" : ""}`} aria-busy={loading}>
            <section className="today-strip" aria-label={t("Reference day at a glance", "Підсумок за вибраний день")}>
              <article className="today-item">
                <span className="today-icon calories"><Flame size={18} /></span>
                <span>
                  <small>{caloriesLeft === null ? t("Calories logged", "Записано калорій") : t("Calories left", "Залишилося калорій")}</small>
                  <strong>{(caloriesLeft === null ? calories : caloriesLeft).toLocaleString(intlLocale)} {t("kcal", "ккал")}</strong>
                </span>
                <span className="tiny-progress"><span style={{ width: `${calorieTarget ? Math.min((calories / calorieTarget) * 100, 100) : calories > 0 ? 100 : 0}%` }} /></span>
              </article>
              <article className="today-item">
                <span className="today-icon workout"><Dumbbell size={18} /></span>
                <span><small>{t("Workouts this week", "Тренувань цього тижня")}</small><strong>{dashboard.training.weekCount} {t("logged", "записано")}</strong></span>
                <button className="mini-action" onClick={() => openLog("Workout")} aria-label={t("Log workout", "Записати тренування")}><Plus size={17} /></button>
              </article>
              <article className="today-item">
                <span className="today-icon spending"><ReceiptText size={18} /></span>
                <span>
                  <small>{selectedPeriod.isCurrent ? t("Spent today", "Витрачено сьогодні") : t("Daily average", "У середньому за день")}</small>
                  <strong>
                    {money(selectedPeriod.isCurrent
                      ? dashboard.finance.spentOnReferenceDate
                      : dashboard.finance.spent / Number(selectedPeriod.endDate.slice(-2)))}
                  </strong>
                </span>
                <button className="mini-action" onClick={() => openLog("Expense")} aria-label={t("Log expense", "Записати витрату")}><Plus size={17} /></button>
              </article>
            </section>

            <section className="dashboard-grid" aria-label={`${selectedPeriod.label} overview`}>
              <article className="card net-worth-card" id="money">
                <div className="card-heading">
                  <div><p className="eyebrow">{t("Net worth", "Чисті активи")}</p><h2>{money(dashboard.wealth.netWorth)}</h2></div>
                  <Link className="quiet-button" href={{ pathname: "/money", query: { period: selectedPeriod.key, currency, view: "wealth" } }}>{t("Open wealth", "Відкрити активи")} <ArrowUpRight size={15} /></Link>
                </div>
                <div className={`positive-change ${dashboard.wealth.change !== null && dashboard.wealth.change < 0 ? "negative" : ""}`}>
                  {dashboard.wealth.change !== null && (dashboard.wealth.change < 0
                    ? <ArrowDownRight size={15} />
                    : <TrendingUp size={15} />)}
                  {dashboard.wealth.change === null
                    ? t("No snapshot comparison", "Немає знімка для порівняння")
                    : `${dashboard.wealth.change >= 0 ? "+" : "−"}${money(Math.abs(dashboard.wealth.change))}`}
                  <span>{dashboard.wealth.changePercent === null ? dashboard.wealth.asOfLabel : `${dashboard.wealth.changePercent >= 0 ? "+" : ""}${dashboard.wealth.changePercent.toFixed(1)}% ${t("between snapshots", "між знімками")}`}</span>
                </div>

                <div className="worth-chart" role="img" aria-label={`${t("Net worth history ending at", "Історія чистих активів, останнє значення")} ${money(dashboard.wealth.netWorth)}`}>
                  <div className="chart-scale">
                    <span>{formatCompact(worthMaximum, currency, intlLocale)}</span>
                    <span>{formatCompact((worthMaximum + worthMinimum) / 2, currency, intlLocale)}</span>
                    <span>{formatCompact(worthMinimum, currency, intlLocale)}</span>
                  </div>
                  <div className="chart-stage">
                    <span className="chart-grid-line top" /><span className="chart-grid-line middle" /><span className="chart-grid-line bottom" />
                    {worthBarHeights.length > 0 ? worthBarHeights.map((height, index) => (
                      <span
                        className={`worth-bar ${index === worthBarHeights.length - 1 ? "current" : ""}`}
                        style={{ height }}
                        key={dashboard.wealth.points[index].id}
                      />
                    )) : <span className="chart-empty">{t("No snapshots for this period", "Немає знімків за цей період")}</span>}
                  </div>
                  <div className="chart-labels">
                    {dashboard.wealth.points.map((point) => (
                      <span key={point.id}>{new Intl.DateTimeFormat(intlLocale, { month: "short", timeZone: "UTC" }).format(new Date(point.recordedAt))}</span>
                    ))}
                  </div>
                </div>

                <div className="worth-breakdown">
                  <div><span className="legend-dot assets" /><p><small>{t("Assets", "Активи")}</small><strong>{money(dashboard.wealth.assets)}</strong></p></div>
                  <div><span className="legend-dot liabilities" /><p><small>{t("Liabilities", "Зобов’язання")}</small><strong>{money(dashboard.wealth.liabilities)}</strong></p></div>
                  <div className="worth-note"><Sparkles size={15} /><span>{dashboard.wealth.asOfLabel}</span></div>
                </div>
              </article>

              <article className="card budget-card">
                <div className="card-heading compact">
                  <div>
                    <p className="eyebrow">{t("Monthly budget", "Місячний бюджет")}</p>
                    <h3>{dashboard.finance.totalBudget === 0 ? t("No budget set", "Бюджет не задано") : dashboard.finance.budgetRemaining >= 0 ? t("On track", "За планом") : t("Over budget", "Бюджет перевищено")}</h3>
                  </div>
                  <Link className="quiet-button" href={{ pathname: "/money", query: { period: selectedPeriod.key, currency, view: "cashflow" } }}>{t("Open cash flow", "Відкрити рух коштів")} <ArrowUpRight size={15} /></Link>
                </div>
                <div className="budget-summary">
                  <div
                    className="budget-ring"
                    style={{
                      "--progress": `${dashboard.finance.totalBudget > 0
                        ? Math.min((dashboard.finance.spent / dashboard.finance.totalBudget) * 360, 360)
                        : 0}deg`,
                    } as CSSProperties}
                  >
                    <div>
                      <strong>{dashboard.finance.totalBudget > 0 ? `${Math.min(Math.round((dashboard.finance.spent / dashboard.finance.totalBudget) * 100), 100)}%` : "—"}</strong>
                      <span>{t("used", "використано")}</span>
                    </div>
                  </div>
                  <div className="budget-numbers">
                    <small>{t("Spent this month", "Витрачено цього місяця")}</small>
                    <strong>{money(dashboard.finance.spent)} <span>{dashboard.finance.totalBudget > 0 ? `/ ${money(dashboard.finance.totalBudget)}` : ""}</span></strong>
                    <p>{dashboard.finance.totalBudget > 0
                      ? `${money(Math.abs(dashboard.finance.budgetRemaining))} ${dashboard.finance.budgetRemaining >= 0 ? t("left", "залишилося") : t("over", "понад бюджет")} · ${selectedPeriod.isCurrent ? `${selectedPeriod.daysRemaining} ${t("days remaining", "днів залишилося")}` : t("month closed", "місяць завершено")}`
                      : t("Add monthly budgets through the finance API", "Додайте місячні бюджети через фінансовий модуль")}</p>
                  </div>
                </div>
                <div className="budget-categories">
                  {dashboard.finance.categories.length > 0 ? dashboard.finance.categories.slice(0, 4).map((category) => {
                    const percentage = category.limit && category.limit > 0
                      ? Math.min((category.used / category.limit) * 100, 100)
                      : category.used > 0 ? 100 : 0;
                    return (
                      <Link
                        className="category-row"
                        href={{ pathname: "/money", query: { period: selectedPeriod.key, currency, category: category.name } }}
                        aria-label={t(`View ${category.name} transactions`, `Переглянути транзакції категорії ${category.name}`)}
                        key={category.name}
                      >
                        <span className={`category-marker ${category.color}`} />
                        <span className="category-name">{category.name}</span>
                        <span className="category-track"><span className={category.color} style={{ width: `${percentage}%` }} /></span>
                        <span className="category-value">{money(category.used)} {category.limit !== null && <small>/ {money(category.limit)}</small>}</span>
                      </Link>
                    );
                  }) : <p className="card-empty">{t("No spending or budgets logged for this month.", "Цього місяця немає витрат або бюджетів.")}</p>}
                </div>
                <div className="budget-footer">
                  <span>{t("Income", "Дохід")} <strong>{money(dashboard.finance.income)}</strong></span>
                  <span>{t("Savings rate", "Рівень заощаджень")} <strong>{dashboard.finance.income > 0 ? `${Math.max(Math.round((dashboard.finance.net / dashboard.finance.income) * 100), 0)}%` : "—"}</strong></span>
                </div>
              </article>

              <article className="card workout-card" id="training">
                <div className="card-heading compact">
                  <div><p className="eyebrow">{t("Training", "Тренування")}</p><h3>{dashboard.training.weekCount} {t("workouts this week", "тренувань цього тижня")}</h3></div>
                  <Link className="status-pill lime" href={{ pathname: "/training", query: { period: selectedPeriod.key } }} aria-label={t("Open training dashboard", "Відкрити панель тренувань")}><Zap size={13} /> {dashboard.training.monthCount} {t("this month", "цього місяця")} <ArrowUpRight size={13} /></Link>
                </div>
                <p className="card-subtitle">{dashboard.training.weekCount === 0 ? t("No sessions in this reference week yet.", "У вибраному тижні тренувань ще немає.") : t("Completed sessions in the selected week.", "Завершені тренування у вибраному тижні.")}</p>
                <div className="week-row" role="group" aria-label={`${dashboard.training.weekCount} workouts completed in the reference week`}>
                  {weekDays.map((day) => {
                    const complete = completedWorkoutDates.has(day.key);
                    return (
                      <div className="day" key={day.key}>
                        <span className={complete ? "done" : day.key === selectedPeriod.referenceDate ? "today" : ""}>{complete ? <Check size={14} /> : day.day}</span>
                        <small>{day.date}</small>
                      </div>
                    );
                  })}
                </div>
                <div className="next-session">
                  <span className="session-icon"><Dumbbell size={19} /></span>
                  <span>
                    <small>{dashboard.training.latestWorkout ? t("Latest session", "Останнє тренування") : t("Training log", "Журнал тренувань")}</small>
                    <strong>{dashboard.training.latestWorkout?.name ?? t("No sessions yet", "Тренувань ще немає")}</strong>
                    <em>{dashboard.training.latestWorkout
                      ? `${dashboard.training.latestWorkout.exerciseCount} ${t("exercises", "вправ")} · ${dashboard.training.latestWorkout.durationMinutes ?? 0} ${t("min", "хв")}`
                      : t("Add your first completed workout", "Додайте перше завершене тренування")}</em>
                  </span>
                  <button onClick={() => openLog("Workout")}>{t("Log", "Записати")} <ArrowRight size={15} /></button>
                </div>
                <div className="workout-stat">
                  <span><small>{t("Monthly volume", "Місячний обсяг")}</small><strong>{dashboard.training.totalVolumeKg.toLocaleString(intlLocale)} {t("kg", "кг")}</strong></span>
                  <span><small>{t("Active time", "Активний час")}</small><strong>{formatDuration(dashboard.training.totalDurationMinutes, locale === "uk")}</strong></span>
                </div>
              </article>

              <article className="card body-card" id="body">
                <div className="card-heading compact">
                  <div><p className="eyebrow">{t("Body & nutrition", "Тіло й харчування")}</p><h3>{dashboard.health.weight === null ? t("No weight", "Немає ваги") : `${dashboard.health.weight.toFixed(1)} ${t("kg", "кг")}`}</h3></div>
                  <Link className="status-pill blue" href={{ pathname: "/body", query: { period: selectedPeriod.key } }} aria-label={t("Open body dashboard", "Відкрити панель тіла")}>
                    {dashboard.health.weightChange !== null && (dashboard.health.weightChange > 0
                      ? <ArrowUpRight size={13} />
                      : <ArrowDownRight size={13} />)}
                    {dashboard.health.weightChange === null ? t("No trend", "Немає тренду") : `${Math.abs(dashboard.health.weightChange).toFixed(1)} ${t("kg", "кг")}`}
                  </Link>
                </div>
                <div className="weight-chart" role="img" aria-label={dashboard.health.weight === null ? t("No weight data for this period", "Немає даних про вагу за цей період") : t(`Weight trend ends at ${dashboard.health.weight.toFixed(1)} kilograms`, `Останнє значення ваги: ${dashboard.health.weight.toFixed(1)} кілограма`)}>
                  {weightChart ? (
                    <>
                      <svg viewBox="0 0 360 90" preserveAspectRatio="none" aria-hidden="true">
                        <path className="weight-area" d={weightChart.area} />
                        <path className="weight-line" d={weightChart.line} />
                        <circle cx={weightChart.last.x} cy={weightChart.last.y} r="4" />
                      </svg>
                      <span className="weight-goal">{t("Range", "Діапазон")} {weightChart.minimum.toFixed(1)}–{weightChart.maximum.toFixed(1)} {t("kg", "кг")}</span>
                    </>
                  ) : <p className="chart-empty">{t("Log a weight entry to start the trend.", "Додайте вагу, щоб побачити тренд.")}</p>}
                </div>
                <div className="macro-list" id="nutrition">
                  <div className="macro-row">
                    <span><Flame size={16} /> {t("Calories", "Калорії")}</span>
                    <span className="macro-track"><span className="calorie-fill" style={{ width: `${calorieTarget ? Math.min((calories / calorieTarget) * 100, 100) : calories > 0 ? 100 : 0}%` }} /></span>
                    <strong>{calories.toLocaleString(intlLocale)} <small>{calorieTarget ? `/ ${calorieTarget.toLocaleString(intlLocale)}` : t("/ no target", "/ без цілі")}</small></strong>
                  </div>
                  <div className="macro-row">
                    <span><Sparkles size={16} /> {t("Protein", "Білок")}</span>
                    <span className="macro-track"><span className="protein-fill" style={{ width: `${proteinShare}%` }} /></span>
                    <strong>{protein.toLocaleString(intlLocale)}{t("g", "г")} <small>{proteinShare}% {t("kcal", "ккал")}</small></strong>
                  </div>
                </div>
                <button className="text-action" onClick={() => openLog("Meal")}>{t("Log nutrition for", "Записати харчування за")} {formatShortDate(selectedPeriod.referenceDate, intlLocale)} <ArrowRight size={15} /></button>
              </article>

              <article className="card savings-card">
                <div className="card-heading compact">
                  <div><p className="eyebrow">{t("Savings goals", "Цілі заощаджень")}</p><h3>{formatCompact(totalGoalCurrent, currency, intlLocale)} {t("set aside", "відкладено")}</h3></div>
                  <Link className="quiet-button" href={{ pathname: "/money", query: { period: selectedPeriod.key, currency, view: "wealth" } }}>{t("Open goals", "Відкрити цілі")} <ArrowUpRight size={15} /></Link>
                </div>
                <p className="card-subtitle">{dashboard.wealth.savedThisPeriod === 0
                  ? t(`No goal contributions in ${selectedPeriod.label}.`, `У ${selectedPeriod.label} внесків до цілей не було.`)
                  : t(`${money(dashboard.wealth.savedThisPeriod)} contributed in ${selectedPeriod.label}.`, `${money(dashboard.wealth.savedThisPeriod)} внесено у ${selectedPeriod.label}.`)}</p>
                <div className="goal-list">
                  {dashboard.goals.length > 0 ? dashboard.goals.slice(0, 2).map((goal, index) => (
                    <button className="goal-row" onClick={() => openLog("Savings")} key={goal.id}>
                      <span className={`goal-icon ${index === 0 ? "emergency" : "trip"}`}>{index === 0 ? "🛟" : "✦"}</span>
                      <span className="goal-copy">
                        <span><strong>{goal.name}</strong><em>{Math.min(Math.round(goal.progress), 100)}%</em></span>
                        <span className="goal-track"><span style={{ width: `${Math.min(goal.progress, 100)}%` }} /></span>
                        <small>{money(goal.current)} {t("of", "з")} {money(goal.target)}</small>
                      </span>
                    </button>
                  )) : <p className="card-empty">{t("No savings goals yet. Your first contribution can create one.", "Цілей заощаджень ще немає. Перший внесок створить ціль.")}</p>}
                </div>
                <div className="savings-insight"><Sparkles size={15} /><span>{dashboard.goals.length > 0
                  ? t(`${dashboard.goals.length} active ${dashboard.goals.length === 1 ? "goal" : "goals"} with a ${money(totalGoalTarget)} combined target.`, `Активних цілей: ${dashboard.goals.length}; загальна сума — ${money(totalGoalTarget)}.`)
                  : t("Quick log a savings entry to create your first goal.", "Додайте заощадження, щоб створити першу ціль.")}</span></div>
              </article>

              <article className="card activity-card">
                <div className="card-heading compact">
                  <div><p className="eyebrow">{t("Recent activity", "Остання активність")}</p><h3>{t("Everything you’ve logged", "Усе, що ви записали")}</h3></div>
                  <button className="quiet-button" onClick={() => openLog()}>{t("Add entry", "Додати запис")} <Plus size={15} /></button>
                </div>
                <div className="activity-list">
                  {dashboard.activities.length > 0 ? dashboard.activities.slice(0, 5).map((activity) => (
                    <div className="activity-row" key={activity.id}>
                      <IconBadge kind={activity.kind} tone={activity.tone} />
                      <span className="activity-copy"><strong>{activity.title}</strong><small>{activity.detail}</small></span>
                      <strong className="activity-value">{activity.value}</strong>
                    </div>
                  )) : <p className="card-empty activity-empty">{t(`No entries logged for ${selectedPeriod.label}.`, `За ${selectedPeriod.label} записів немає.`)}</p>}
                </div>
              </article>

              <article className="card momentum-card">
                <p className="eyebrow">{t("Tracking coverage", "Повнота відстеження")}</p>
                <div className="momentum-score"><strong>{dashboard.coverage.score}</strong><span>/ 100</span></div>
                <h3>{dashboard.coverage.score === 100 ? t("Every area has real data.", "У кожній сфері є дані.") : t("Your dashboard is taking shape.", "Ваша панель наповнюється.")}</h3>
                <p>{dashboard.coverage.missing.length > 0
                  ? t(`Add ${dashboard.coverage.missing.join(", ").toLowerCase()} entries to complete this month’s view.`, `Додайте записи: ${dashboard.coverage.missing.map(areaLabel).join(", ").toLowerCase()}, щоб завершити огляд місяця.`)
                  : t(`All five tracking areas have entries in ${selectedPeriod.label}.`, `У всіх п’яти сферах є записи за ${selectedPeriod.label}.`)}</p>
                <div className="momentum-tags">
                  {(["Money", "Training", "Nutrition", "Body", "Savings"] as const).map((area) => {
                    const complete = dashboard.coverage.tracked.includes(area);
                    return <span className={complete ? "" : "watch"} key={area}>{complete ? <CheckCircle2 size={14} /> : <Flame size={14} />}{locale === "uk" ? areaLabel(area) : area}</span>;
                  })}
                </div>
              </article>
            </section>
          </div>
        )}

        <footer className="page-footer">
          <span>{t("Better Tracker is showing records from your FastAPI backend.", "Better Tracker показує дані з вашого сервера FastAPI.")}</span>
          <button onClick={refreshData}><RotateCcw size={14} className={loading ? "spin" : ""} /> {t("Refresh data", "Оновити дані")}</button>
        </footer>
      </main>

      <nav className="mobile-nav" aria-label={t("Mobile navigation", "Мобільна навігація")}>
        {navigation.map(({ label, uk, icon: Icon, href }) => (
          <Link className={href === "/" ? "active" : ""} key={label} href={href} aria-label={t(label, uk)} aria-current={href === "/" ? "page" : undefined}>
            <Icon size={19} /><span>{t(label, uk)}</span>
          </Link>
        ))}
        <button className="mobile-add" onClick={() => openLog()} aria-label={t("Quick log", "Швидкий запис")} disabled={!dashboard || dashboardStale}><Plus size={23} /></button>
      </nav>

      {dialogOpen && (
        <div className="dialog-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target && !saving) setDialogOpen(false); }}>
          <section className="quick-dialog" role="dialog" aria-modal="true" aria-labelledby="quick-log-title" ref={dialogRef}>
            <div className="dialog-header">
              <div><p className="eyebrow">{t("Quick log", "Швидкий запис")}</p><h2 id="quick-log-title">{t("Add to your backend", "Додати запис")}</h2></div>
              <button className="icon-button" onClick={() => setDialogOpen(false)} aria-label={t("Close quick log", "Закрити швидкий запис")} disabled={saving}><X size={20} /></button>
            </div>
            <div className="log-tabs" aria-label={t("Entry type", "Тип запису")}>
              {logTypes.map(({ label, icon: Icon }) => (
                <button type="button" aria-pressed={logType === label} className={logType === label ? "active" : ""} key={label} onClick={() => setLogType(label)} disabled={saving}>
                  <Icon size={17} /><span>{logLabel(label)}</span>
                </button>
              ))}
            </div>
            <form className="log-form" onSubmit={handleLog} key={logType}>
              {logType === "Savings" ? (
                savingsGoals.length > 0 ? (
                  <label>
                    <span>{t("Goal", "Ціль")}</span>
                    <select name="goalId" defaultValue={savingsGoals[0].id} required>
                      {savingsGoals.map((goal) => <option value={goal.id} key={goal.id}>{goal.name}</option>)}
                    </select>
                  </label>
                ) : (
                  <>
                    <label><span>{t("New goal name", "Назва нової цілі")}</span><input name="newGoalName" required placeholder={t("Emergency fund", "Резервний фонд")} maxLength={120} /></label>
                    <label><span>{t("Goal target", "Сума цілі")}</span><div className="input-unit"><input name="newGoalTarget" type="number" min="0.01" step="0.01" placeholder="12000" required /><em>{currencyKey}</em></div></label>
                  </>
                )
              ) : (
                <label>
                  <span>{logType === "Workout" ? t("Session name", "Назва тренування") : logType === "Meal" ? t("Day note", "Нотатка про день") : logType === "Weight" ? t("Note", "Примітка") : t("Description", "Опис")}</span>
                  <input
                    name="description"
                    required={logType !== "Weight"}
                    placeholder={logType === "Expense" ? t("Coffee & lunch", "Кава та обід") : logType === "Workout" ? t("Lower body", "Нижня частина тіла") : logType === "Meal" ? t("Daily nutrition", "Харчування за день") : t("Add a short description", "Додайте короткий опис")}
                    maxLength={logType === "Workout" ? 200 : 500}
                  />
                </label>
              )}
              {logType === "Expense" && (
                <label>
                  <span>{t("Category", "Категорія")}</span>
                  <select name="category" defaultValue={defaultCategory}>{categoryOptions.map((category) => <option key={category} value={category}>{locale === "uk" ? ({ Housing: "Житло", Food: "Їжа", Transport: "Транспорт", Lifestyle: "Стиль життя", Other: "Інше" })[category] ?? category : category}</option>)}</select>
                </label>
              )}
              <div className="form-grid">
                {logType === "Workout" ? (
                  <label><span>{t("Duration", "Тривалість")}</span><div className="input-unit"><input name="duration" type="number" min="1" placeholder="55" required /><em>{t("min", "хв")}</em></div></label>
                ) : (
                  <label>
                    <span>{logType === "Meal" ? t("Calories", "Калорії") : logType === "Weight" ? t("Weight", "Вага") : t("Amount", "Сума")}</span>
                    <div className="input-unit">
                      <input
                        name="value"
                        type="number"
                        min={logType === "Meal" ? "1" : "0.01"}
                        step={logType === "Meal" ? "1" : logType === "Weight" ? "0.01" : "0.01"}
                        defaultValue={logType === "Weight" ? dashboard?.health.weight ?? "" : ""}
                        placeholder={logType === "Meal" ? "2100" : logType === "Weight" ? "75.4" : "25.00"}
                        required
                      />
                      <em>{logType === "Meal" ? t("kcal", "ккал") : logType === "Weight" ? t("kg", "кг") : currencyKey}</em>
                    </div>
                  </label>
                )}
                {logType === "Meal" ? (
                  <label><span>{t("Protein", "Білок")}</span><div className="input-unit"><input name="protein" type="number" min="0" step="0.01" placeholder="150" /><em>{t("g", "г")}</em></div></label>
                ) : (
                  <label><span>{t("Date", "Дата")}</span><input name="date" type="date" min={selectedPeriod.startDate} max={selectedPeriod.endDate} defaultValue={selectedPeriod.referenceDate} required /></label>
                )}
              </div>
              {logType === "Meal" && (
                <div className="form-grid">
                  <label><span>{t("Calorie target (optional)", "Ціль калорій (необов’язково)")}</span><div className="input-unit"><input name="calorieTarget" type="number" min="1" defaultValue={dashboard?.health.calorieTarget ?? ""} /><em>{t("kcal", "ккал")}</em></div></label>
                  <label><span>{t("Date", "Дата")}</span><input name="date" type="date" min={selectedPeriod.startDate} max={selectedPeriod.endDate} defaultValue={selectedPeriod.referenceDate} required /></label>
                </div>
              )}
              <div className="dialog-note"><Sparkles size={16} /><span>{t("This saves directly to FastAPI and refreshes your dashboard from the database.", "Запис буде збережено, а дані на панелі — оновлено.")}</span></div>
              <div className="dialog-actions">
                <button type="button" className="secondary-button" onClick={() => setDialogOpen(false)} disabled={saving}>{t("Cancel", "Скасувати")}</button>
                <button className="submit-button" type="submit" disabled={saving}>
                  {saving ? <RotateCcw size={17} className="spin" /> : <Check size={17} />} {saving ? t("Saving…", "Зберігаємо…") : `${t("Save", "Зберегти")}: ${logLabel(logType).toLowerCase()}`}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {toast && (
        <div className={`toast ${toast.tone}`} role={toast.tone === "error" ? "alert" : "status"} aria-live="polite">
          <span className="toast-check">{toast.tone === "error" ? <X size={15} /> : <Check size={15} />}</span>
          <span>{toast.message}</span>
          {toast.undo && <button onClick={undoLastLog} disabled={undoing}>{undoing ? t("Undoing…", "Скасовуємо…") : t("Undo", "Скасувати")}</button>}
          <button className="toast-close" onClick={() => setToast(null)} aria-label={t("Dismiss", "Закрити")}><X size={15} /></button>
        </div>
      )}
    </div>
  );
}

export default function DashboardPage({ user, initialCurrency = "UAH" }: { user: AuthUser; initialCurrency?: string }) {
  return <LocaleProvider user={user}><LocalizedDashboardPage user={user} initialCurrency={initialCurrency} /></LocaleProvider>;
}
