"use client";

import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Dumbbell,
  Flame,
  LayoutDashboard,
  MoreHorizontal,
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
  { label: "Overview", icon: LayoutDashboard, href: "/" },
  { label: "Money", icon: WalletCards, href: "/money" },
  { label: "Training", icon: Dumbbell, href: "/training" },
  { label: "Nutrition", icon: Utensils, href: "/nutrition" },
  { label: "Body", icon: Scale, href: "/body" },
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

function formatCompact(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    style: "currency",
    currency,
    maximumFractionDigits: 1,
  }).format(value);
}

function formatLongDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

function formatShortDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0 ? `${hours}h ${remainder}m` : `${hours}h`;
}

function getWeekDays(referenceDate: string) {
  const reference = new Date(`${referenceDate}T12:00:00Z`);
  const mondayOffset = (reference.getUTCDay() + 6) % 7;
  const monday = new Date(reference);
  monday.setUTCDate(reference.getUTCDate() - mondayOffset);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setUTCDate(monday.getUTCDate() + index);
    return {
      key: date.toISOString().slice(0, 10),
      day: ["S", "M", "T", "W", "T", "F", "S"][date.getUTCDay()],
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
  return (
    <section className={`dashboard-state ${error ? "error" : "loading"}`} role={error ? "alert" : "status"}>
      <span className="state-icon">
        {error ? <X size={20} /> : <RotateCcw size={20} />}
      </span>
      <div>
        <h2>{error ? "The backend could not be loaded" : "Loading your live data"}</h2>
        <p>{error ?? "Fetching money, training, health, and wealth records…"}</p>
      </div>
      {error && <button onClick={onRetry}>Try again</button>}
    </section>
  );
}

export default function DashboardPage({ user }: { user: AuthUser }) {
  const periodOptions = useMemo(() => getPeriodOptions(), []);
  const [periodKey, setPeriodKey] = useState(() => getPeriodOptions()[0].key);
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

  const selectedPeriod = dashboard?.period ?? getPeriod(periodKey);
  const currency = dashboard?.currency ?? "USD";
  const money = (value: number) => formatMoney(value, currency);

  useEffect(() => {
    const controller = new AbortController();
    void fetchDashboard(periodKey, controller.signal)
      .then((data) => {
        setDashboard(data);
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLoadError(error instanceof Error ? error.message : "The backend request failed.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [periodKey, refreshVersion]);

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
    setDashboard(null);
    setLoading(true);
    setLoadError(null);
    setToast({ message: `Loading ${getPeriod(nextPeriod).label}`, tone: "info" });
  };

  const openLog = (type: LogType = "Expense", category = "Food") => {
    lastFocusedRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    setLogType(type);
    setDefaultCategory(category);
    setDialogOpen(true);
  };

  const showNotice = (message: string) => {
    setToast({ message, tone: "info" });
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
        currency,
      });
      setDialogOpen(false);
      setToast({ message: `${logType} saved to the backend`, tone: "success", undo });
      setLoading(true);
      setRefreshVersion((current) => current + 1);
    } catch (error) {
      setToast({
        message: error instanceof Error ? error.message : `Could not save ${logType.toLowerCase()}.`,
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
      setToast({ message: "The backend entry was undone", tone: "success" });
      setLoading(true);
      setRefreshVersion((current) => current + 1);
    } catch (error) {
      setToast({
        message: error instanceof Error ? error.message : "Could not undo the backend entry.",
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

  const weekDays = getWeekDays(selectedPeriod.referenceDate);
  const completedWorkoutDates = new Set(dashboard?.training.workoutDates ?? []);
  const remainingWorkouts = Math.max(4 - (dashboard?.training.weekCount ?? 0), 0);
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
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="Better Tracker home">
          <span className="brand-mark"><BrandMark /></span>
          <span className="brand-wordmark">BETTER TRACKER</span>
        </Link>

        <nav className="sidebar-nav" aria-label="Primary navigation">
          <p className="nav-eyebrow">Workspace</p>
          {navigation.map(({ label, icon: Icon, href }) => (
            <Link
              className={label === "Overview" ? "nav-item active" : "nav-item"}
              key={label}
              href={href}
              aria-label={label}
              aria-current={label === "Overview" ? "page" : undefined}
            >
              <Icon size={19} strokeWidth={1.9} />
              <span>{label}</span>
              {label === "Overview" && <span className="nav-dot" />}
            </Link>
          ))}
        </nav>

        <div className="sidebar-focus">
          <div className="focus-heading">
            <span><Target size={16} /> {selectedPeriod.label.split(" ")[0]} budget</span>
            <span className="focus-percent">{focusBudget > 0 ? `${focusPercent}%` : "—"}</span>
          </div>
          <p>{focusBudget > 0 ? "Keep monthly spending inside your plan." : "Add category budgets to see your monthly plan."}</p>
          <div className="focus-bar"><span style={{ width: `${focusPercent}%` }} /></div>
          <div className="focus-meta">
            <span>{money(focusSpent)} spent</span>
            <span>{focusBudget > 0 ? money(focusBudget) : "No budget"}</span>
          </div>
        </div>

        <AccountSummary user={user} />
      </aside>

      <header className="mobile-header">
        <Link className="brand" href="/" aria-label="Better Tracker home">
          <span className="brand-mark"><BrandMark /></span>
          <span className="brand-wordmark">BETTER TRACKER</span>
        </Link>
        <div className="mobile-header-actions">
          <button className="icon-button" aria-label="Notifications" onClick={() => showNotice("No notification service is connected")}>
            <Bell size={19} />
          </button>
          <AccountSummary user={user} compact />
        </div>
      </header>

      <main className="main-content" id="overview" aria-busy={loading}>
        <header className="dashboard-header">
          <div>
            <div className="date-line">
              <CalendarDays size={15} />
              {selectedPeriod.isCurrent ? formatLongDate(selectedPeriod.referenceDate) : `${selectedPeriod.label} review`}
            </div>
            <h1>Your life, in one view.</h1>
            <p>{dashboard
              ? `Live backend data across ${dashboard.coverage.tracked.length} of 5 tracking areas.`
              : "Connecting to your Better Tracker backend."}</p>
          </div>
          <div className="header-actions">
            <label className="month-picker">
              <span className="sr-only">Select month</span>
              <select value={periodKey} onChange={(event) => changePeriod(event.target.value)}>
                {periodOptions.map((period) => <option value={period.key} key={period.key}>{period.label}</option>)}
              </select>
              <ChevronDown size={15} aria-hidden="true" />
            </label>
            <button className="icon-button desktop-only" aria-label="Notifications" onClick={() => showNotice("No notification service is connected")}>
              <Bell size={19} />
            </button>
            <button className="quick-log-button" onClick={() => openLog()}><Plus size={18} /> Quick log</button>
          </div>
        </header>

        {loadError && dashboard && (
          <div className="data-banner error" role="alert">
            <span>{loadError}</span><button onClick={refreshData}>Retry</button>
          </div>
        )}
        {loading && dashboard && (
          <div className="data-banner loading" role="status"><RotateCcw size={14} className="spin" /> Refreshing backend data…</div>
        )}

        {!dashboard ? (
          <DashboardState error={loadError} onRetry={refreshData} />
        ) : (
          <>
            <section className="today-strip" aria-label="Reference day at a glance">
              <article className="today-item">
                <span className="today-icon calories"><Flame size={18} /></span>
                <span>
                  <small>{caloriesLeft === null ? "Calories logged" : "Calories left"}</small>
                  <strong>{caloriesLeft === null ? calories.toLocaleString() : caloriesLeft.toLocaleString()} kcal</strong>
                </span>
                <span className="tiny-progress"><span style={{ width: `${calorieTarget ? Math.min((calories / calorieTarget) * 100, 100) : calories > 0 ? 100 : 0}%` }} /></span>
              </article>
              <article className="today-item">
                <span className="today-icon workout"><Dumbbell size={18} /></span>
                <span><small>Workouts this week</small><strong>{dashboard.training.weekCount} logged</strong></span>
                <button className="mini-action" onClick={() => openLog("Workout")} aria-label="Log workout"><Plus size={17} /></button>
              </article>
              <article className="today-item">
                <span className="today-icon spending"><ReceiptText size={18} /></span>
                <span>
                  <small>{selectedPeriod.isCurrent ? "Spent today" : "Daily average"}</small>
                  <strong>
                    {money(selectedPeriod.isCurrent
                      ? dashboard.finance.spentOnReferenceDate
                      : dashboard.finance.spent / Number(selectedPeriod.endDate.slice(-2)))}
                  </strong>
                </span>
                <button className="mini-action" onClick={() => openLog("Expense")} aria-label="Log expense"><Plus size={17} /></button>
              </article>
            </section>

            <section className="dashboard-grid" aria-label={`${selectedPeriod.label} overview`}>
              <article className="card net-worth-card" id="money">
                <div className="card-heading">
                  <div><p className="eyebrow">Net worth</p><h2>{money(dashboard.wealth.netWorth)}</h2></div>
                  <button className="quiet-button" onClick={() => showNotice(dashboard.wealth.asOfLabel)}>Data source <ArrowUpRight size={15} /></button>
                </div>
                <div className={`positive-change ${dashboard.wealth.change !== null && dashboard.wealth.change < 0 ? "negative" : ""}`}>
                  {dashboard.wealth.change !== null && dashboard.wealth.change < 0
                    ? <ArrowDownRight size={15} />
                    : <TrendingUp size={15} />}
                  {dashboard.wealth.change === null
                    ? "No snapshot comparison"
                    : `${dashboard.wealth.change >= 0 ? "+" : "−"}${money(Math.abs(dashboard.wealth.change))}`}
                  <span>{dashboard.wealth.changePercent === null ? dashboard.wealth.asOfLabel : `${dashboard.wealth.changePercent >= 0 ? "+" : ""}${dashboard.wealth.changePercent.toFixed(1)}% between snapshots`}</span>
                </div>

                <div className="worth-chart" role="img" aria-label={`Net worth history ending at ${money(dashboard.wealth.netWorth)}`}>
                  <div className="chart-scale">
                    <span>{formatCompact(worthMaximum, currency)}</span>
                    <span>{formatCompact((worthMaximum + worthMinimum) / 2, currency)}</span>
                    <span>{formatCompact(worthMinimum, currency)}</span>
                  </div>
                  <div className="chart-stage">
                    <span className="chart-grid-line top" /><span className="chart-grid-line middle" /><span className="chart-grid-line bottom" />
                    {worthBarHeights.length > 0 ? worthBarHeights.map((height, index) => (
                      <span
                        className={`worth-bar ${index === worthBarHeights.length - 1 ? "current" : ""}`}
                        style={{ height }}
                        key={dashboard.wealth.points[index].id}
                      />
                    )) : <span className="chart-empty">No snapshots for this period</span>}
                  </div>
                  <div className="chart-labels">
                    {dashboard.wealth.points.map((point) => (
                      <span key={point.id}>{new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(new Date(point.recordedAt))}</span>
                    ))}
                  </div>
                </div>

                <div className="worth-breakdown">
                  <div><span className="legend-dot assets" /><p><small>Assets</small><strong>{money(dashboard.wealth.assets)}</strong></p></div>
                  <div><span className="legend-dot liabilities" /><p><small>Liabilities</small><strong>{money(dashboard.wealth.liabilities)}</strong></p></div>
                  <div className="worth-note"><Sparkles size={15} /><span>{dashboard.wealth.asOfLabel}</span></div>
                </div>
              </article>

              <article className="card budget-card">
                <div className="card-heading compact">
                  <div>
                    <p className="eyebrow">Monthly budget</p>
                    <h3>{dashboard.finance.totalBudget === 0 ? "No budget set" : dashboard.finance.budgetRemaining >= 0 ? "On track" : "Over budget"}</h3>
                  </div>
                  <button className="icon-button small" aria-label="Log a budget expense" onClick={() => openLog("Expense")}><MoreHorizontal size={19} /></button>
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
                      <span>used</span>
                    </div>
                  </div>
                  <div className="budget-numbers">
                    <small>Spent this month</small>
                    <strong>{money(dashboard.finance.spent)} <span>{dashboard.finance.totalBudget > 0 ? `/ ${money(dashboard.finance.totalBudget)}` : ""}</span></strong>
                    <p>{dashboard.finance.totalBudget > 0
                      ? `${money(Math.abs(dashboard.finance.budgetRemaining))} ${dashboard.finance.budgetRemaining >= 0 ? "left" : "over"} · ${selectedPeriod.isCurrent ? `${selectedPeriod.daysRemaining} days remaining` : "month closed"}`
                      : "Add monthly budgets through the finance API"}</p>
                  </div>
                </div>
                <div className="budget-categories">
                  {dashboard.finance.categories.length > 0 ? dashboard.finance.categories.slice(0, 4).map((category) => {
                    const percentage = category.limit && category.limit > 0
                      ? Math.min((category.used / category.limit) * 100, 100)
                      : category.used > 0 ? 100 : 0;
                    return (
                      <button className="category-row" key={category.name} onClick={() => openLog("Expense", category.name)}>
                        <span className={`category-marker ${category.color}`} />
                        <span className="category-name">{category.name}</span>
                        <span className="category-track"><span className={category.color} style={{ width: `${percentage}%` }} /></span>
                        <span className="category-value">{money(category.used)} {category.limit !== null && <small>/ {money(category.limit)}</small>}</span>
                      </button>
                    );
                  }) : <p className="card-empty">No spending or budgets logged for this month.</p>}
                </div>
                <div className="budget-footer">
                  <span>Income <strong>{money(dashboard.finance.income)}</strong></span>
                  <span>Savings rate <strong>{dashboard.finance.income > 0 ? `${Math.max(Math.round((dashboard.finance.net / dashboard.finance.income) * 100), 0)}%` : "—"}</strong></span>
                </div>
              </article>

              <article className="card workout-card" id="training">
                <div className="card-heading compact">
                  <div><p className="eyebrow">Training</p><h3>{dashboard.training.weekCount} of 4 workouts</h3></div>
                  <span className="status-pill lime"><Zap size={13} /> {dashboard.training.monthCount} this month</span>
                </div>
                <p className="card-subtitle">{remainingWorkouts === 0 ? "Weekly goal complete. Nicely done." : `${remainingWorkouts} ${remainingWorkouts === 1 ? "session" : "sessions"} left in this reference week.`}</p>
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
                    <small>{dashboard.training.latestWorkout ? "Latest session" : "Training log"}</small>
                    <strong>{dashboard.training.latestWorkout?.name ?? "No sessions yet"}</strong>
                    <em>{dashboard.training.latestWorkout
                      ? `${dashboard.training.latestWorkout.exerciseCount} exercises · ${dashboard.training.latestWorkout.durationMinutes ?? 0} min`
                      : "Add your first completed workout"}</em>
                  </span>
                  <button onClick={() => openLog("Workout")}>Log <ArrowRight size={15} /></button>
                </div>
                <div className="workout-stat">
                  <span><small>Monthly volume</small><strong>{dashboard.training.totalVolumeKg.toLocaleString()} kg</strong></span>
                  <span><small>Active time</small><strong>{formatDuration(dashboard.training.totalDurationMinutes)}</strong></span>
                </div>
              </article>

              <article className="card body-card" id="body">
                <div className="card-heading compact">
                  <div><p className="eyebrow">Body & nutrition</p><h3>{dashboard.health.weight === null ? "No weight" : `${dashboard.health.weight.toFixed(1)} kg`}</h3></div>
                  <span className="status-pill blue">
                    {dashboard.health.weightChange !== null && dashboard.health.weightChange > 0
                      ? <ArrowUpRight size={13} />
                      : <ArrowDownRight size={13} />}
                    {dashboard.health.weightChange === null ? "No trend" : `${Math.abs(dashboard.health.weightChange).toFixed(1)} kg`}
                  </span>
                </div>
                <div className="weight-chart" role="img" aria-label={dashboard.health.weight === null ? "No weight data for this period" : `Weight trend ends at ${dashboard.health.weight.toFixed(1)} kilograms`}>
                  {weightChart ? (
                    <>
                      <svg viewBox="0 0 360 90" preserveAspectRatio="none" aria-hidden="true">
                        <path className="weight-area" d={weightChart.area} />
                        <path className="weight-line" d={weightChart.line} />
                        <circle cx={weightChart.last.x} cy={weightChart.last.y} r="4" />
                      </svg>
                      <span className="weight-goal">Range {weightChart.minimum.toFixed(1)}–{weightChart.maximum.toFixed(1)} kg</span>
                    </>
                  ) : <p className="chart-empty">Log a weight entry to start the trend.</p>}
                </div>
                <div className="macro-list" id="nutrition">
                  <div className="macro-row">
                    <span><Flame size={16} /> Calories</span>
                    <span className="macro-track"><span className="calorie-fill" style={{ width: `${calorieTarget ? Math.min((calories / calorieTarget) * 100, 100) : calories > 0 ? 100 : 0}%` }} /></span>
                    <strong>{calories.toLocaleString()} <small>{calorieTarget ? `/ ${calorieTarget.toLocaleString()}` : "/ no target"}</small></strong>
                  </div>
                  <div className="macro-row">
                    <span><Sparkles size={16} /> Protein</span>
                    <span className="macro-track"><span className="protein-fill" style={{ width: `${proteinShare}%` }} /></span>
                    <strong>{protein.toLocaleString()}g <small>{proteinShare}% kcal</small></strong>
                  </div>
                </div>
                <button className="text-action" onClick={() => openLog("Meal")}>Log food for {formatShortDate(selectedPeriod.referenceDate)} <ArrowRight size={15} /></button>
              </article>

              <article className="card savings-card">
                <div className="card-heading compact">
                  <div><p className="eyebrow">Savings goals</p><h3>{formatCompact(totalGoalCurrent, currency)} set aside</h3></div>
                  <button className="icon-button small" onClick={() => openLog("Savings")} aria-label="Add savings"><Plus size={18} /></button>
                </div>
                <p className="card-subtitle">{dashboard.wealth.savedThisPeriod === 0
                  ? `No goal contributions in ${selectedPeriod.label}.`
                  : `${money(dashboard.wealth.savedThisPeriod)} contributed in ${selectedPeriod.label}.`}</p>
                <div className="goal-list">
                  {dashboard.goals.length > 0 ? dashboard.goals.slice(0, 2).map((goal, index) => (
                    <button className="goal-row" onClick={() => openLog("Savings")} key={goal.id}>
                      <span className={`goal-icon ${index === 0 ? "emergency" : "trip"}`}>{index === 0 ? "🛟" : "✦"}</span>
                      <span className="goal-copy">
                        <span><strong>{goal.name}</strong><em>{Math.min(Math.round(goal.progress), 100)}%</em></span>
                        <span className="goal-track"><span style={{ width: `${Math.min(goal.progress, 100)}%` }} /></span>
                        <small>{money(goal.current)} of {money(goal.target)}</small>
                      </span>
                    </button>
                  )) : <p className="card-empty">No savings goals yet. Your first contribution can create one.</p>}
                </div>
                <div className="savings-insight"><Sparkles size={15} /><span>{dashboard.goals.length > 0
                  ? `${dashboard.goals.length} active ${dashboard.goals.length === 1 ? "goal" : "goals"} with a ${money(totalGoalTarget)} combined target.`
                  : "Quick log a savings entry to create your first goal."}</span></div>
              </article>

              <article className="card activity-card">
                <div className="card-heading compact">
                  <div><p className="eyebrow">Recent activity</p><h3>Everything you’ve logged</h3></div>
                  <button className="quiet-button" onClick={() => openLog()}>Add entry <Plus size={15} /></button>
                </div>
                <div className="activity-list">
                  {dashboard.activities.length > 0 ? dashboard.activities.slice(0, 5).map((activity) => (
                    <div className="activity-row" key={activity.id}>
                      <IconBadge kind={activity.kind} tone={activity.tone} />
                      <span className="activity-copy"><strong>{activity.title}</strong><small>{activity.detail}</small></span>
                      <strong className="activity-value">{activity.value}</strong>
                    </div>
                  )) : <p className="card-empty activity-empty">No entries logged for {selectedPeriod.label}.</p>}
                </div>
              </article>

              <article className="card momentum-card">
                <p className="eyebrow">Tracking coverage</p>
                <div className="momentum-score"><strong>{dashboard.coverage.score}</strong><span>/ 100</span></div>
                <h3>{dashboard.coverage.score === 100 ? "Every area has real data." : "Your dashboard is taking shape."}</h3>
                <p>{dashboard.coverage.missing.length > 0
                  ? `Add ${dashboard.coverage.missing.join(", ").toLowerCase()} entries to complete this month’s view.`
                  : `All five tracking areas have entries in ${selectedPeriod.label}.`}</p>
                <div className="momentum-tags">
                  {(["Money", "Training", "Nutrition"] as const).map((area) => {
                    const complete = dashboard.coverage.tracked.includes(area);
                    return <span className={complete ? "" : "watch"} key={area}>{complete ? <CheckCircle2 size={14} /> : <Flame size={14} />}{area}</span>;
                  })}
                </div>
              </article>
            </section>
          </>
        )}

        <footer className="page-footer">
          <span>Better Tracker is showing records from your FastAPI backend.</span>
          <button onClick={refreshData}><RotateCcw size={14} className={loading ? "spin" : ""} /> Refresh data</button>
        </footer>
      </main>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {navigation.map(({ label, icon: Icon, href }) => (
          <Link className={label === "Overview" ? "active" : ""} key={label} href={href} aria-label={label} aria-current={label === "Overview" ? "page" : undefined}>
            <Icon size={19} /><span>{label}</span>
          </Link>
        ))}
        <button className="mobile-add" onClick={() => openLog()} aria-label="Quick log"><Plus size={23} /></button>
      </nav>

      {dialogOpen && (
        <div className="dialog-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target && !saving) setDialogOpen(false); }}>
          <section className="quick-dialog" role="dialog" aria-modal="true" aria-labelledby="quick-log-title" ref={dialogRef}>
            <div className="dialog-header">
              <div><p className="eyebrow">Quick log</p><h2 id="quick-log-title">Add to your backend</h2></div>
              <button className="icon-button" onClick={() => setDialogOpen(false)} aria-label="Close quick log" disabled={saving}><X size={20} /></button>
            </div>
            <div className="log-tabs" aria-label="Entry type">
              {logTypes.map(({ label, icon: Icon }) => (
                <button type="button" aria-pressed={logType === label} className={logType === label ? "active" : ""} key={label} onClick={() => setLogType(label)} disabled={saving}>
                  <Icon size={17} /><span>{label}</span>
                </button>
              ))}
            </div>
            <form className="log-form" onSubmit={handleLog} key={logType}>
              {logType === "Savings" ? (
                savingsGoals.length > 0 ? (
                  <label>
                    <span>Goal</span>
                    <select name="goalId" defaultValue={savingsGoals[0].id} required>
                      {savingsGoals.map((goal) => <option value={goal.id} key={goal.id}>{goal.name}</option>)}
                    </select>
                  </label>
                ) : (
                  <>
                    <label><span>New goal name</span><input name="newGoalName" required defaultValue="Emergency fund" maxLength={120} /></label>
                    <label><span>Goal target</span><div className="input-unit"><input name="newGoalTarget" type="number" min="0.01" step="0.01" defaultValue="12000" required /><em>{currency}</em></div></label>
                  </>
                )
              ) : (
                <label>
                  <span>{logType === "Workout" ? "Session name" : logType === "Meal" ? "Meal or food" : logType === "Weight" ? "Note" : "Description"}</span>
                  <input
                    name="description"
                    required={logType !== "Weight"}
                    defaultValue={logType === "Expense" ? "Coffee & lunch" : logType === "Workout" ? "Lower body" : logType === "Meal" ? "Dinner" : ""}
                    placeholder="Add a short description"
                    maxLength={logType === "Workout" ? 200 : 500}
                  />
                </label>
              )}
              {logType === "Expense" && (
                <label>
                  <span>Category</span>
                  <select name="category" defaultValue={defaultCategory}>{categoryOptions.map((category) => <option key={category}>{category}</option>)}</select>
                </label>
              )}
              <div className="form-grid">
                {logType === "Workout" ? (
                  <label><span>Duration</span><div className="input-unit"><input name="duration" type="number" min="1" defaultValue="55" required /><em>min</em></div></label>
                ) : (
                  <label>
                    <span>{logType === "Meal" ? "Calories" : logType === "Weight" ? "Weight" : "Amount"}</span>
                    <div className="input-unit">
                      <input
                        name="value"
                        type="number"
                        min={logType === "Meal" ? "1" : "0.01"}
                        step={logType === "Meal" ? "1" : logType === "Weight" ? "0.01" : "0.01"}
                        defaultValue={logType === "Meal" ? "540" : logType === "Weight" ? dashboard?.health.weight ?? "" : "25"}
                        required
                      />
                      <em>{logType === "Meal" ? "kcal" : logType === "Weight" ? "kg" : currency}</em>
                    </div>
                  </label>
                )}
                {logType === "Meal" ? (
                  <label><span>Protein</span><div className="input-unit"><input name="protein" type="number" min="0" step="0.01" defaultValue="32" /><em>g</em></div></label>
                ) : (
                  <label><span>Date</span><input name="date" type="date" min={selectedPeriod.startDate} max={selectedPeriod.endDate} defaultValue={selectedPeriod.referenceDate} required /></label>
                )}
              </div>
              {logType === "Meal" && (
                <div className="form-grid">
                  <label><span>Calorie target (optional)</span><div className="input-unit"><input name="calorieTarget" type="number" min="1" defaultValue={dashboard?.health.calorieTarget ?? ""} /><em>kcal</em></div></label>
                  <label><span>Date</span><input name="date" type="date" min={selectedPeriod.startDate} max={selectedPeriod.endDate} defaultValue={selectedPeriod.referenceDate} required /></label>
                </div>
              )}
              <div className="dialog-note"><Sparkles size={16} /><span>This saves directly to FastAPI and refreshes your dashboard from the database.</span></div>
              <div className="dialog-actions">
                <button type="button" className="secondary-button" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</button>
                <button className="submit-button" type="submit" disabled={saving}>
                  {saving ? <RotateCcw size={17} className="spin" /> : <Check size={17} />} {saving ? "Saving…" : `Save ${logType.toLowerCase()}`}
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
          {toast.undo && <button onClick={undoLastLog} disabled={undoing}>{undoing ? "Undoing…" : "Undo"}</button>}
          <button className="toast-close" onClick={() => setToast(null)} aria-label="Dismiss"><X size={15} /></button>
        </div>
      )}
    </div>
  );
}
