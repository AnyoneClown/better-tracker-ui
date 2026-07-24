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
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type LogType = "Expense" | "Income" | "Workout" | "Meal" | "Weight" | "Savings";

type Activity = {
  id: number;
  kind: LogType;
  title: string;
  detail: string;
  value: string;
  tone: "green" | "orange" | "blue" | "purple" | "neutral";
};

type TrackerState = {
  spent: number;
  income: number;
  calories: number;
  protein: number;
  weight: number;
  workouts: number;
  saved: number;
  netWorth: number;
  categoryAdjustments: Record<string, number>;
  activities: Activity[];
};

const initialActivities: Activity[] = [
  { id: 1, kind: "Expense", title: "Grocery run", detail: "Food · 16:42", value: "−$84.30", tone: "orange" },
  { id: 2, kind: "Weight", title: "Morning weigh-in", detail: "Body · 08:10", value: "78.4 kg", tone: "blue" },
  { id: 3, kind: "Meal", title: "Chicken grain bowl", detail: "Lunch · 13:05", value: "620 kcal", tone: "green" },
  { id: 4, kind: "Workout", title: "Upper body", detail: "58 min · Yesterday", value: "6 exercises", tone: "purple" },
  { id: 5, kind: "Savings", title: "Emergency fund", detail: "Transfer · Yesterday", value: "+$250", tone: "green" },
];

const initialState: TrackerState = {
  spent: 2146,
  income: 5400,
  calories: 1640,
  protein: 118,
  weight: 78.4,
  workouts: 3,
  saved: 10550,
  netWorth: 34820,
  categoryAdjustments: {},
  activities: initialActivities,
};

const storageKeys = {
  tracker: "better-tracker-demo",
  month: "better-tracker-month",
  legacyTracker: "northstar-demo",
  legacyMonth: "northstar-month",
} as const;

const monthPresets: Record<string, TrackerState> = {
  "July 2026": initialState,
  "June 2026": {
    spent: 2860,
    income: 5150,
    calories: 2110,
    protein: 146,
    weight: 78.8,
    workouts: 4,
    saved: 9730,
    netWorth: 33580,
    categoryAdjustments: {},
    activities: [
      { id: 61, kind: "Savings", title: "Emergency fund", detail: "Transfer · 30 Jun", value: "+$300", tone: "green" },
      { id: 62, kind: "Workout", title: "Full body", detail: "62 min · 29 Jun", value: "7 exercises", tone: "purple" },
      { id: 63, kind: "Expense", title: "Dinner with friends", detail: "Lifestyle · 28 Jun", value: "−$72.40", tone: "orange" },
    ],
  },
  "May 2026": {
    spent: 3040,
    income: 4920,
    calories: 1985,
    protein: 132,
    weight: 79.3,
    workouts: 3,
    saved: 9080,
    netWorth: 32690,
    categoryAdjustments: {},
    activities: [
      { id: 51, kind: "Income", title: "Freelance project", detail: "Income · 31 May", value: "+$680", tone: "green" },
      { id: 52, kind: "Weight", title: "Morning weigh-in", detail: "Body · 30 May", value: "79.3 kg", tone: "blue" },
      { id: 53, kind: "Workout", title: "Upper body", detail: "54 min · 29 May", value: "6 exercises", tone: "purple" },
    ],
  },
};

const navigation = [
  { label: "Overview", icon: LayoutDashboard, target: "overview" },
  { label: "Money", icon: WalletCards, target: "money" },
  { label: "Training", icon: Dumbbell, target: "training" },
  { label: "Nutrition", icon: Utensils, target: "nutrition" },
  { label: "Body", icon: Scale, target: "body" },
];

const logTypes: { label: LogType; icon: typeof ReceiptText }[] = [
  { label: "Expense", icon: ReceiptText },
  { label: "Income", icon: CircleDollarSign },
  { label: "Workout", icon: Dumbbell },
  { label: "Meal", icon: Utensils },
  { label: "Weight", icon: Scale },
  { label: "Savings", icon: PiggyBank },
];

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

function restoreTrackerState(raw: string): TrackerState | null {
  try {
    const value = JSON.parse(raw) as Partial<TrackerState>;
    const numericKeys: (keyof Pick<TrackerState, "spent" | "income" | "calories" | "protein" | "weight" | "workouts" | "saved" | "netWorth">)[] = [
      "spent", "income", "calories", "protein", "weight", "workouts", "saved", "netWorth",
    ];
    if (!numericKeys.every((key) => Number.isFinite(value[key])) || !Array.isArray(value.activities)) return null;
    return {
      ...initialState,
      ...value,
      categoryAdjustments: value.categoryAdjustments && typeof value.categoryAdjustments === "object" ? value.categoryAdjustments : {},
      activities: value.activities,
    } as TrackerState;
  } catch {
    return null;
  }
}

function formatCompact(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 1,
  }).format(value);
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

export default function Home() {
  const [tracker, setTracker] = useState<TrackerState>(initialState);
  const [activeNav, setActiveNav] = useState("Overview");
  const [month, setMonth] = useState("July 2026");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [logType, setLogType] = useState<LogType>("Expense");
  const [defaultCategory, setDefaultCategory] = useState("Food");
  const [toast, setToast] = useState<string | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const undoSnapshot = useRef<TrackerState | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKeys.tracker) ?? window.localStorage.getItem(storageKeys.legacyTracker);
    const savedMonth = window.localStorage.getItem(storageKeys.month) ?? window.localStorage.getItem(storageKeys.legacyMonth);
    if (saved) {
      const restored = restoreTrackerState(saved);
      if (restored) {
        window.localStorage.removeItem(storageKeys.legacyTracker);
        window.localStorage.removeItem(storageKeys.legacyMonth);
        const timer = window.setTimeout(() => {
          setTracker(restored);
          if (savedMonth && monthPresets[savedMonth]) setMonth(savedMonth);
          setHydrated(true);
        }, 0);
        return () => window.clearTimeout(timer);
      } else {
        window.localStorage.removeItem(storageKeys.tracker);
        window.localStorage.removeItem(storageKeys.legacyTracker);
      }
    }
    const timer = window.setTimeout(() => setHydrated(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (hydrated) {
      window.localStorage.setItem(storageKeys.tracker, JSON.stringify(tracker));
      window.localStorage.setItem(storageKeys.month, month);
    }
  }, [tracker, month, hydrated]);

  useEffect(() => {
    if (!dialogOpen) return;
    const background = Array.from(document.querySelectorAll<HTMLElement>(".sidebar, .mobile-header, .main-content, .mobile-nav"));
    background.forEach((element) => { element.inert = true; });
    const focusTimer = window.setTimeout(() => dialogRef.current?.querySelector<HTMLInputElement>("input")?.focus(), 0);
    const handleDialogKeys = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDialogOpen(false);
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])"));
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
  }, [dialogOpen]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const remainingBudget = 3200 - tracker.spent;
  const spendingPercent = Math.min(Math.round((tracker.spent / 3200) * 100), 100);
  const caloriesLeft = Math.max(2250 - tracker.calories, 0);
  const savingsRate = Math.max(Math.round(((tracker.income - tracker.spent) / tracker.income) * 100), 0);
  const liabilities = 7780;
  const assets = tracker.netWorth + liabilities;
  const emergencyFund = Math.max(0, 8450 + tracker.saved - 10550);
  const emergencyProgress = Math.min(Math.round((emergencyFund / 12000) * 100), 100);
  const remainingWorkouts = Math.max(4 - tracker.workouts, 0);
  const addedToday = Object.values(tracker.categoryAdjustments).reduce((total, value) => total + value, 0);
  const currentSpend = month === "July 2026" ? 84.3 + addedToday : tracker.spent / 30;

  const categoryBases = useMemo(() => {
    if (month === "June 2026") return { Housing: 1400, Food: 620, Transport: 320, Lifestyle: 520 };
    if (month === "May 2026") return { Housing: 1400, Food: 690, Transport: 310, Lifestyle: 640 };
    return { Housing: 1200, Food: 486, Transport: 220, Lifestyle: 240 };
  }, [month]);

  const budgetCategories = useMemo(
    () => [
      { name: "Housing", used: categoryBases.Housing + (tracker.categoryAdjustments.Housing ?? 0), limit: 1400, color: "forest" },
      { name: "Food", used: categoryBases.Food + (tracker.categoryAdjustments.Food ?? 0), limit: 600, color: "lime" },
      { name: "Transport", used: categoryBases.Transport + (tracker.categoryAdjustments.Transport ?? 0), limit: 350, color: "amber" },
      { name: "Lifestyle", used: categoryBases.Lifestyle + (tracker.categoryAdjustments.Lifestyle ?? 0), limit: 300, color: "slate" },
    ],
    [categoryBases, tracker.categoryAdjustments],
  );

  const openLog = (type: LogType = "Expense", category = "Food") => {
    lastFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setLogType(type);
    setDefaultCategory(category);
    setDialogOpen(true);
  };

  const changeMonth = (nextMonth: string) => {
    setMonth(nextMonth);
    setTracker(monthPresets[nextMonth] ?? initialState);
    setCanUndo(false);
    undoSnapshot.current = null;
    setToast(`Showing ${nextMonth}`);
  };

  const navigateTo = (label: string, target: string) => {
    setActiveNav(label);
    document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const showNotice = (message: string) => {
    setCanUndo(false);
    setToast(message);
  };

  const handleLog = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const numericValue = Number(form.get("value") ?? 0);
    const description = String(form.get("description") || "New entry");
    const category = String(form.get("category") || "General");
    const entryDate = String(form.get("date") || "2026-07-24");
    const when = entryDate === "2026-07-24"
      ? "Just now"
      : new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short" }).format(new Date(`${entryDate}T12:00:00`));
    undoSnapshot.current = tracker;
    setCanUndo(true);

    setTracker((current) => {
      const next = { ...current };
      let activity: Activity;

      if (logType === "Expense") {
        next.spent += numericValue;
        next.netWorth -= numericValue;
        next.categoryAdjustments = { ...current.categoryAdjustments, [category]: (current.categoryAdjustments[category] ?? 0) + numericValue };
        activity = { id: Date.now(), kind: logType, title: description, detail: `${category} · ${when}`, value: `−${money.format(numericValue)}`, tone: "orange" };
      } else if (logType === "Income") {
        next.income += numericValue;
        next.netWorth += numericValue;
        activity = { id: Date.now(), kind: logType, title: description, detail: `Income · ${when}`, value: `+${money.format(numericValue)}`, tone: "green" };
      } else if (logType === "Meal") {
        const protein = Number(form.get("protein") ?? 0);
        next.calories += numericValue;
        next.protein += protein;
        activity = { id: Date.now(), kind: logType, title: description, detail: `Meal · ${when}`, value: `${numericValue} kcal`, tone: "green" };
      } else if (logType === "Weight") {
        next.weight = numericValue;
        activity = { id: Date.now(), kind: logType, title: "Weight check-in", detail: `Body · ${when}`, value: `${numericValue.toFixed(1)} kg`, tone: "blue" };
      } else if (logType === "Workout") {
        const duration = Number(form.get("duration") ?? 45);
        next.workouts += 1;
        activity = { id: Date.now(), kind: logType, title: description, detail: `${duration} min · ${when}`, value: "Completed", tone: "purple" };
      } else {
        next.saved += numericValue;
        activity = { id: Date.now(), kind: logType, title: description, detail: `Savings · ${when}`, value: `+${money.format(numericValue)}`, tone: "green" };
      }

      next.activities = [activity, ...current.activities].slice(0, 7);
      return next;
    });

    setDialogOpen(false);
    setToast(`${logType} added to your day`);
  };

  const undoLastLog = () => {
    if (undoSnapshot.current) {
      setTracker(undoSnapshot.current);
      undoSnapshot.current = null;
      setCanUndo(false);
      setToast("Last entry undone");
    }
  };

  const resetDemo = () => {
    undoSnapshot.current = tracker;
    setCanUndo(true);
    setMonth("July 2026");
    setTracker(initialState);
    setToast("Demo data reset");
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => navigateTo("Overview", "overview")} aria-label="Better Tracker home">
          <span className="brand-mark"><BrandMark /></span>
          <span className="brand-wordmark">BETTER TRACKER</span>
        </button>

        <nav className="sidebar-nav" aria-label="Primary navigation">
          <p className="nav-eyebrow">Workspace</p>
          {navigation.map(({ label, icon: Icon, target }) => (
            <button
              className={activeNav === label ? "nav-item active" : "nav-item"}
              key={label}
              onClick={() => navigateTo(label, target)}
              aria-label={label}
            >
              <Icon size={19} strokeWidth={1.9} />
              <span>{label}</span>
              {label === "Overview" && <span className="nav-dot" />}
            </button>
          ))}
        </nav>

        <div className="sidebar-focus">
          <div className="focus-heading">
            <span><Target size={16} /> July focus</span>
            <span className="focus-percent">74%</span>
          </div>
          <p>Build a calmer money routine.</p>
          <div className="focus-bar"><span /></div>
          <div className="focus-meta"><span>$815 saved</span><span>$1,100</span></div>
        </div>

        <button className="profile-row" onClick={resetDemo} title="Reset demo data" aria-label="Reset demo data">
          <span className="avatar">AM</span>
          <span className="profile-copy"><strong>Alex Morgan</strong><small>Personal space</small></span>
          <RotateCcw size={16} />
        </button>
      </aside>

      <header className="mobile-header">
        <button className="brand" onClick={() => navigateTo("Overview", "overview")} aria-label="Better Tracker home">
          <span className="brand-mark"><BrandMark /></span>
          <span className="brand-wordmark">BETTER TRACKER</span>
        </button>
        <button className="icon-button" aria-label="Notifications" onClick={() => showNotice("You’re all caught up")}><Bell size={19} /><span className="notification-dot" /></button>
      </header>

      <main className="main-content" id="overview">
        <header className="dashboard-header">
          <div>
            <div className="date-line"><CalendarDays size={15} /> {month === "July 2026" ? "Friday, 24 July" : `${month} review`}</div>
            <h1>Your life, in one view.</h1>
            <p>You’re moving in the right direction across <strong>4 of 5 areas</strong> this month.</p>
          </div>
          <div className="header-actions">
            <label className="month-picker">
              <span className="sr-only">Select month</span>
              <select value={month} onChange={(event) => changeMonth(event.target.value)}>
                <option>July 2026</option>
                <option>June 2026</option>
                <option>May 2026</option>
              </select>
              <ChevronDown size={15} aria-hidden="true" />
            </label>
            <button className="icon-button desktop-only" aria-label="Notifications" onClick={() => showNotice("You’re all caught up")}><Bell size={19} /><span className="notification-dot" /></button>
            <button className="quick-log-button" onClick={() => openLog()}><Plus size={18} /> Quick log</button>
          </div>
        </header>

        <section className="today-strip" aria-label="Today at a glance">
          <article className="today-item">
            <span className="today-icon calories"><Flame size={18} /></span>
            <span><small>Calories left</small><strong>{caloriesLeft.toLocaleString()} kcal</strong></span>
            <span className="tiny-progress"><span style={{ width: `${Math.min((tracker.calories / 2250) * 100, 100)}%` }} /></span>
          </article>
          <article className="today-item">
            <span className="today-icon workout"><Dumbbell size={18} /></span>
            <span><small>Next workout</small><strong>Lower body · 18:30</strong></span>
            <button className="mini-action" onClick={() => openLog("Workout")} aria-label="Log workout"><ArrowRight size={17} /></button>
          </article>
          <article className="today-item">
            <span className="today-icon spending"><ReceiptText size={18} /></span>
            <span><small>{month === "July 2026" ? "Spent today" : "Daily average"}</small><strong>{money.format(currentSpend)} <em>{month === "July 2026" ? "of $105" : "per day"}</em></strong></span>
            <button className="mini-action" onClick={() => openLog("Expense")} aria-label="Log expense"><Plus size={17} /></button>
          </article>
        </section>

        <section className="dashboard-grid" aria-label={`${month} overview`}>
          <article className="card net-worth-card" id="money">
            <div className="card-heading">
              <div><p className="eyebrow">Net worth</p><h2>{money.format(tracker.netWorth)}</h2></div>
              <button className="quiet-button" onClick={() => setActiveNav("Money")}>View details <ArrowUpRight size={15} /></button>
            </div>
            <div className="positive-change"><TrendingUp size={15} /> $1,240 <span>+3.7% this month</span></div>

            <div className="worth-chart" role="img" aria-label={`Net worth trend ends at ${money.format(tracker.netWorth)} in ${month}`}>
              <div className="chart-scale"><span>$35k</span><span>$30k</span><span>$25k</span></div>
              <div className="chart-stage">
                <span className="chart-grid-line top" /><span className="chart-grid-line middle" /><span className="chart-grid-line bottom" />
                {[42, 50, 49, 62, 68, 79, 83, 96, 92, 108, 116, 132].map((height, index) => (
                  <span className={`worth-bar ${index === 11 ? "current" : ""}`} style={{ height }} key={`${height}-${index}`} />
                ))}
              </div>
              <div className="chart-labels"><span>Feb</span><span>Mar</span><span>Apr</span><span>May</span><span>Jun</span><span>Jul</span></div>
            </div>

            <div className="worth-breakdown">
              <div><span className="legend-dot assets" /><p><small>Assets</small><strong>{money.format(assets)}</strong></p></div>
              <div><span className="legend-dot liabilities" /><p><small>Liabilities</small><strong>{money.format(liabilities)}</strong></p></div>
              <div className="worth-note"><Sparkles size={15} /><span>Highest point yet</span></div>
            </div>
          </article>

          <article className="card budget-card">
            <div className="card-heading compact">
              <div><p className="eyebrow">Monthly budget</p><h3>On track</h3></div>
              <button className="icon-button small" aria-label="Log a budget expense" onClick={() => openLog("Expense")}><MoreHorizontal size={19} /></button>
            </div>
            <div className="budget-summary">
              <div className="budget-ring" style={{ "--progress": `${spendingPercent * 3.6}deg` } as React.CSSProperties}>
                <div><strong>{spendingPercent}%</strong><span>used</span></div>
              </div>
              <div className="budget-numbers">
                <small>Spent this month</small>
                <strong>{money.format(tracker.spent)} <span>/ $3,200</span></strong>
                <p>{remainingBudget >= 0 ? `${money.format(remainingBudget)} left` : `${money.format(Math.abs(remainingBudget))} over`} · {month === "July 2026" ? "8 days remaining" : "month closed"}</p>
              </div>
            </div>
            <div className="budget-categories">
              {budgetCategories.map((category) => {
                const percentage = Math.min((category.used / category.limit) * 100, 100);
                return (
                  <button className="category-row" key={category.name} onClick={() => openLog("Expense", category.name)}>
                    <span className={`category-marker ${category.color}`} />
                    <span className="category-name">{category.name}</span>
                    <span className="category-track"><span className={category.color} style={{ width: `${percentage}%` }} /></span>
                    <span className="category-value">{money.format(category.used)} <small>/ {money.format(category.limit)}</small></span>
                  </button>
                );
              })}
            </div>
            <div className="budget-footer">
              <span>Income <strong>{money.format(tracker.income)}</strong></span>
              <span>Savings rate <strong>{savingsRate}%</strong></span>
            </div>
          </article>

          <article className="card workout-card" id="training">
            <div className="card-heading compact">
              <div><p className="eyebrow">Training</p><h3>{tracker.workouts} of 4 workouts</h3></div>
              <span className="status-pill lime"><Zap size={13} /> +6%</span>
            </div>
            <p className="card-subtitle">{remainingWorkouts === 0 ? "Weekly goal complete. Nicely done." : `A strong week. ${remainingWorkouts === 1 ? "One session" : `${remainingWorkouts} sessions`} to go.`}</p>
            <div className="week-row" aria-label={`${tracker.workouts} of 4 workouts completed this week`}>
              {["M", "T", "W", "T", "F", "S", "S"].map((day, index) => (
                <div className="day" key={`${day}-${index}`}><span className={index < Math.min(tracker.workouts, 7) ? "done" : index === 4 ? "today" : ""}>{index < Math.min(tracker.workouts, 7) ? <Check size={14} /> : day}</span><small>{["20", "21", "22", "23", "24", "25", "26"][index]}</small></div>
              ))}
            </div>
            <div className="next-session">
              <span className="session-icon"><Dumbbell size={19} /></span>
              <span><small>Up next</small><strong>Lower body</strong><em>6 exercises · ~55 min</em></span>
              <button onClick={() => openLog("Workout")}>Start <ArrowRight size={15} /></button>
            </div>
            <div className="workout-stat"><span><small>Weekly volume</small><strong>18,420 kg</strong></span><span><small>Active time</small><strong>2h 47m</strong></span></div>
          </article>

          <article className="card body-card" id="body">
            <div className="card-heading compact">
              <div><p className="eyebrow">Body & nutrition</p><h3>{tracker.weight.toFixed(1)} kg</h3></div>
              <span className="status-pill blue"><ArrowDownRight size={13} /> 0.6 kg</span>
            </div>
            <div className="weight-chart" role="img" aria-label={`Weight trend over 30 days ends at ${tracker.weight.toFixed(1)} kilograms`}>
              <svg viewBox="0 0 360 90" preserveAspectRatio="none" aria-hidden="true">
                <path className="weight-area" d="M0,21 C35,15 52,27 82,24 C115,20 130,42 162,37 C195,32 211,52 242,48 C275,43 286,67 320,62 C340,59 350,69 360,67 L360,90 L0,90 Z" />
                <path className="weight-line" d="M0,21 C35,15 52,27 82,24 C115,20 130,42 162,37 C195,32 211,52 242,48 C275,43 286,67 320,62 C340,59 350,69 360,67" />
                <circle cx="360" cy="67" r="4" />
              </svg>
              <span className="weight-goal">Goal 75 kg</span>
            </div>
            <div className="macro-list" id="nutrition">
              <div className="macro-row"><span><Flame size={16} /> Calories</span><span className="macro-track"><span className="calorie-fill" style={{ width: `${Math.min((tracker.calories / 2250) * 100, 100)}%` }} /></span><strong>{tracker.calories.toLocaleString()} <small>/ 2,250</small></strong></div>
              <div className="macro-row"><span><Sparkles size={16} /> Protein</span><span className="macro-track"><span className="protein-fill" style={{ width: `${Math.min((tracker.protein / 160) * 100, 100)}%` }} /></span><strong>{tracker.protein}g <small>/ 160g</small></strong></div>
            </div>
            <button className="text-action" onClick={() => openLog("Meal")}>Log your next meal <ArrowRight size={15} /></button>
          </article>

          <article className="card savings-card">
            <div className="card-heading compact">
              <div><p className="eyebrow">Savings goals</p><h3>{formatCompact(tracker.saved)} set aside</h3></div>
              <button className="icon-button small" onClick={() => openLog("Savings")} aria-label="Add savings"><Plus size={18} /></button>
            </div>
            <p className="card-subtitle">You’re ahead of your July plan.</p>
            <div className="goal-list">
              <button className="goal-row" onClick={() => openLog("Savings")}>
                <span className="goal-icon emergency">🛟</span>
                <span className="goal-copy"><span><strong>Emergency fund</strong><em>{emergencyProgress}%</em></span><span className="goal-track"><span style={{ width: `${emergencyProgress}%` }} /></span><small>{money.format(emergencyFund)} of $12,000</small></span>
              </button>
              <button className="goal-row" onClick={() => openLog("Savings")}>
                <span className="goal-icon trip">✈</span>
                <span className="goal-copy"><span><strong>Japan trip</strong><em>53%</em></span><span className="goal-track"><span style={{ width: "53%" }} /></span><small>$2,100 of $4,000</small></span>
              </button>
            </div>
            <div className="savings-insight"><Sparkles size={15} /><span>At this pace, your emergency fund will be ready <strong>2 months early.</strong></span></div>
          </article>

          <article className="card activity-card">
            <div className="card-heading compact">
              <div><p className="eyebrow">Recent activity</p><h3>Everything you’ve logged</h3></div>
              <button className="quiet-button" onClick={() => openLog()}>Add entry <Plus size={15} /></button>
            </div>
            <div className="activity-list">
              {tracker.activities.slice(0, 5).map((activity) => (
                <div className="activity-row" key={activity.id}>
                  <IconBadge kind={activity.kind} tone={activity.tone} />
                  <span className="activity-copy"><strong>{activity.title}</strong><small>{activity.detail}</small></span>
                  <strong className="activity-value">{activity.value}</strong>
                </div>
              ))}
            </div>
          </article>

          <article className="card momentum-card">
            <p className="eyebrow">Monthly momentum</p>
            <div className="momentum-score"><strong>82</strong><span>/ 100</span></div>
            <h3>You’re building real momentum.</h3>
            <p>Money and training are leading the way. A little more sleep consistency will lift everything else.</p>
            <div className="momentum-tags"><span><CheckCircle2 size={14} /> Budget</span><span><CheckCircle2 size={14} /> Training</span><span className="watch"><Flame size={14} /> Sleep</span></div>
          </article>
        </section>

        <footer className="page-footer"><span>Better Tracker keeps your personal progress in one calm place.</span><button onClick={resetDemo}><RotateCcw size={14} /> Reset demo data</button></footer>
      </main>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {navigation.map(({ label, icon: Icon, target }) => (
          <button className={activeNav === label ? "active" : ""} key={label} onClick={() => navigateTo(label, target)} aria-label={label}>
            <Icon size={19} /><span>{label}</span>
          </button>
        ))}
        <button className="mobile-add" onClick={() => openLog()} aria-label="Quick log"><Plus size={23} /></button>
      </nav>

      {dialogOpen && (
        <div className="dialog-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setDialogOpen(false); }}>
          <section className="quick-dialog" role="dialog" aria-modal="true" aria-labelledby="quick-log-title" ref={dialogRef}>
            <div className="dialog-header">
              <div><p className="eyebrow">Quick log</p><h2 id="quick-log-title">Add to your day</h2></div>
              <button className="icon-button" onClick={() => setDialogOpen(false)} aria-label="Close quick log"><X size={20} /></button>
            </div>
            <div className="log-tabs" aria-label="Entry type">
              {logTypes.map(({ label, icon: Icon }) => (
                <button type="button" aria-pressed={logType === label} className={logType === label ? "active" : ""} key={label} onClick={() => setLogType(label)}>
                  <Icon size={17} /><span>{label}</span>
                </button>
              ))}
            </div>
            <form className="log-form" onSubmit={handleLog} key={logType}>
              <label>
                <span>{logType === "Workout" ? "Session name" : logType === "Meal" ? "Meal or food" : logType === "Savings" ? "Goal" : logType === "Weight" ? "Note" : "Description"}</span>
                <input name="description" required={logType !== "Weight"} defaultValue={logType === "Expense" ? "Coffee & lunch" : logType === "Workout" ? "Lower body" : logType === "Meal" ? "Dinner" : logType === "Savings" ? "Emergency fund" : ""} placeholder="Add a short description" />
              </label>
              {logType === "Expense" && (
                <label><span>Category</span><select name="category" defaultValue={defaultCategory}><option>Housing</option><option>Food</option><option>Transport</option><option>Lifestyle</option></select></label>
              )}
              <div className="form-grid">
                {logType === "Workout" ? (
                  <label><span>Duration</span><div className="input-unit"><input name="duration" type="number" min="1" defaultValue="55" required /><em>min</em></div></label>
                ) : (
                  <label>
                    <span>{logType === "Meal" ? "Calories" : logType === "Weight" ? "Weight" : "Amount"}</span>
                    <div className="input-unit"><input name="value" type="number" min="0.1" step={logType === "Weight" ? "0.1" : "0.01"} defaultValue={logType === "Meal" ? "540" : logType === "Weight" ? tracker.weight : "25"} required /><em>{logType === "Meal" ? "kcal" : logType === "Weight" ? "kg" : "USD"}</em></div>
                  </label>
                )}
                {logType === "Meal" ? (
                  <label><span>Protein</span><div className="input-unit"><input name="protein" type="number" min="0" defaultValue="32" /><em>g</em></div></label>
                ) : (
                  <label><span>Date</span><input name="date" type="date" defaultValue="2026-07-24" required /></label>
                )}
              </div>
              <div className="dialog-note"><Sparkles size={16} /><span>This updates your overview instantly and stays on this device.</span></div>
              <div className="dialog-actions"><button type="button" className="secondary-button" onClick={() => setDialogOpen(false)}>Cancel</button><button className="submit-button" type="submit"><Check size={17} /> Save {logType.toLowerCase()}</button></div>
            </form>
          </section>
        </div>
      )}

      {toast && (
        <div className="toast" role="status" aria-live="polite">
          <span className="toast-check"><Check size={15} /></span><span>{toast}</span>
          {canUndo && <button onClick={undoLastLog}>Undo</button>}
          <button className="toast-close" onClick={() => setToast(null)} aria-label="Dismiss"><X size={15} /></button>
        </div>
      )}
    </div>
  );
}
