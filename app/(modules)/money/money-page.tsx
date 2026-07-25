"use client";

import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  Camera,
  CircleDollarSign,
  CreditCard,
  Edit3,
  Landmark,
  Minus,
  PiggyBank,
  Plus,
  ReceiptText,
  Target,
  Trash2,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import type { FormEvent } from "react";
import { useCallback, useMemo, useState } from "react";

import { DataNotice, EmptyState, ModuleDialog, ModuleHeader, ModuleState, ModuleToast, SaveActions } from "@/components/module-ui";
import { useModuleData } from "@/hooks/use-module-data";
import {
  asNumber,
  createRecord,
  deleteRecord,
  fetchMoneyData,
  type FinancialAccount,
  type FinancialTransaction,
  type MonthlyBudget,
  type NetWorthSnapshot,
  type SavingsContribution,
  type SavingsGoal,
  updateRecord,
} from "@/lib/module-api";
import { formatMoney, getPeriod } from "@/lib/tracker-api";

type Toast = { message: string; tone: "success" | "error" };
type MoneyDialog =
  | { kind: "transaction"; record?: FinancialTransaction }
  | { kind: "budget"; record?: MonthlyBudget }
  | { kind: "account"; record?: FinancialAccount }
  | { kind: "goal"; record?: SavingsGoal }
  | { kind: "contribution"; goal: SavingsGoal; record?: SavingsContribution };

function shortDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${date.slice(0, 10)}T12:00:00Z`));
}

function titleCase(value: string): string {
  return value.split(/\s+/).filter(Boolean).map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");
}

export default function MoneyPage({ initialPeriodKey }: { initialPeriodKey: string }) {
  const [periodKey, setPeriodKey] = useState(initialPeriodKey);
  const { data, loading, error, refresh } = useModuleData(periodKey, fetchMoneyData);
  const [tab, setTab] = useState<"cashflow" | "wealth">("cashflow");
  const [dialog, setDialog] = useState<MoneyDialog | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const period = data?.period ?? getPeriod(periodKey, new Date(`${initialPeriodKey}-15T12:00:00Z`));
  const currency = data?.finance.currency ?? "USD";
  const money = useCallback((value: number) => formatMoney(value, currency), [currency]);
  const closeDialog = useCallback(() => setDialog(null), []);
  const goalsById = useMemo(() => new Map(data?.goals.map((goal) => [goal.id, goal.name]) ?? []), [data?.goals]);

  const reportError = (reason: unknown, fallback: string) => {
    setToast({ message: reason instanceof Error ? reason.message : fallback, tone: "error" });
  };

  const saveTransaction = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (dialog?.kind !== "transaction") return;
    const form = new FormData(event.currentTarget);
    const payload = {
      kind: String(form.get("kind")),
      amount: Number(form.get("amount")),
      category: String(form.get("category")).trim(),
      occurred_on: String(form.get("occurred_on")),
      currency,
      description: String(form.get("description") ?? "").trim() || null,
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
            : "Money entry";

  const totalIncome = asNumber(data?.finance.total_income);
  const totalExpenses = asNumber(data?.finance.total_expenses);
  const totalBudget = asNumber(data?.finance.total_budget);
  const budgetRemaining = asNumber(data?.finance.budget_remaining);

  return (
    <>
      <ModuleHeader eyebrow="Money" title="Know where every dollar is going." description="Manage cash flow, budgets, accounts, savings, and net worth from one live workspace." periodKey={periodKey} initialPeriodKey={initialPeriodKey} onPeriodChange={setPeriodKey} onAdd={() => setDialog(tab === "cashflow" ? { kind: "transaction" } : { kind: "account" })} addLabel={tab === "cashflow" ? "Add transaction" : "Add account"} />
      <div className="module-tabs" role="tablist" aria-label="Money view">
        <button role="tab" aria-selected={tab === "cashflow"} className={tab === "cashflow" ? "active" : ""} onClick={() => setTab("cashflow")}><ReceiptText size={16} /> Cash flow</button>
        <button role="tab" aria-selected={tab === "wealth"} className={tab === "wealth" ? "active" : ""} onClick={() => setTab("wealth")}><Landmark size={16} /> Wealth & savings</button>
      </div>
      {data && <DataNotice loading={loading} error={error} onRetry={refresh} />}
      {!data ? <ModuleState error={error} onRetry={refresh} /> : tab === "cashflow" ? (
        <>
          <section className="module-stats module-stats-four" aria-label="Cash flow summary">
            <article className="module-stat"><span className="stat-icon lime"><ArrowUpRight size={18} /></span><p>Income</p><strong>{money(totalIncome)}</strong><em>{data.transactions.filter((item) => item.kind === "income").length} entries</em></article>
            <article className="module-stat"><span className="stat-icon amber"><ArrowDownRight size={18} /></span><p>Expenses</p><strong>{money(totalExpenses)}</strong><em>{data.transactions.filter((item) => item.kind === "expense").length} entries</em></article>
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
              <div className="section-heading"><div><p className="eyebrow">Ledger</p><h2>Transactions</h2></div><span className="record-count">{data.transactions.length} records</span></div>
              {data.transactions.length > 0 ? (
                <div className="transaction-list">
                  {data.transactions.map((transaction) => (
                    <article className="transaction-row" key={transaction.id}>
                      <span className={`transaction-icon ${transaction.kind}`} >{transaction.kind === "income" ? <ArrowUpRight size={17} /> : <ArrowDownRight size={17} />}</span>
                      <div className="record-primary"><h3>{transaction.description || titleCase(transaction.category)}</h3><p>{titleCase(transaction.category)} · {shortDate(transaction.occurred_on)}</p></div>
                      <strong className={`transaction-amount ${transaction.kind}`}>{transaction.kind === "expense" ? "−" : "+"}{money(asNumber(transaction.amount))}</strong>
                      <div className="record-actions"><button onClick={() => setDialog({ kind: "transaction", record: transaction })} aria-label="Edit transaction"><Edit3 size={16} /></button><button className="danger" onClick={() => void remove(`/finance/transactions/${transaction.id}`, "Transaction")} aria-label="Delete transaction"><Trash2 size={16} /></button></div>
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
            <article className="module-stat"><span className="stat-icon blue"><PiggyBank size={18} /></span><p>Savings accounts</p><strong>{money(asNumber(data.wealth.savings))}</strong><em>{data.accounts.filter((item) => item.is_savings).length} accounts marked savings</em></article>
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
          <div className="form-grid"><label><span>Type</span><select name="kind" defaultValue={dialog.record?.kind ?? "expense"}><option value="expense">Expense</option><option value="income">Income</option></select></label><label><span>Date</span><input name="occurred_on" type="date" min={period.startDate} max={period.endDate} defaultValue={dialog.record?.occurred_on ?? period.referenceDate} required /></label></div>
          <div className="form-grid"><label><span>Amount</span><div className="input-unit"><input name="amount" type="number" min="0.01" step="0.01" defaultValue={dialog.record ? asNumber(dialog.record.amount) : ""} placeholder="45.00" required /><em>{currency}</em></div></label><label><span>Category</span><input name="category" maxLength={100} defaultValue={dialog.record?.category ?? ""} placeholder="Food" required /></label></div>
          <label><span>Description</span><input name="description" maxLength={500} defaultValue={dialog.record?.description ?? ""} placeholder="What was this for?" /></label>
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
      </ModuleDialog>
      {toast && <ModuleToast {...toast} onClose={() => setToast(null)} />}
    </>
  );
}
