"use client";

import { Activity, Edit3, Gauge, Scale, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import type { FormEvent } from "react";
import { useCallback, useState } from "react";

import { DataNotice, EmptyState, ModuleDialog, ModuleHeader, ModuleState, ModuleToast, SaveActions } from "@/components/module-ui";
import { useModuleData } from "@/hooks/use-module-data";
import { asNumber, createRecord, deleteRecord, fetchBodyData, type WeightEntry, updateRecord } from "@/lib/module-api";
import { getPeriod } from "@/lib/tracker-api";

type Toast = { message: string; tone: "success" | "error" };

function optionalNumber(form: FormData, name: string): number | null {
  const value = String(form.get(name) ?? "").trim();
  return value === "" ? null : Number(value);
}

function shortDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}

function WeightChart({ entries }: { entries: WeightEntry[] }) {
  const ordered = entries.slice().reverse();
  if (ordered.length === 0) return null;
  const values = ordered.map((entry) => asNumber(entry.weight_kg));
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = Math.max(maximum - minimum, 1);
  const points = ordered.length === 1
    ? [{ x: 0, y: 58 }, { x: 600, y: 58 }]
    : ordered.map((entry, index) => ({ x: (index / (ordered.length - 1)) * 600, y: 16 + ((maximum - asNumber(entry.weight_kg)) / range) * 92 }));
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ");
  return (
    <div className="body-chart-wrap">
      <div className="chart-scale"><span>{maximum.toFixed(1)} kg</span><span>{minimum.toFixed(1)} kg</span></div>
      <svg className="body-line-chart" viewBox="0 0 600 130" preserveAspectRatio="none" role="img" aria-label="Weight trend">
        <defs><linearGradient id="body-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#c8e77d" stopOpacity=".42" /><stop offset="1" stopColor="#c8e77d" stopOpacity="0" /></linearGradient></defs>
        <path d={`${path} L600,130 L0,130 Z`} fill="url(#body-fill)" />
        <path d={path} fill="none" stroke="#245645" strokeWidth="4" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

export default function BodyPage({ initialPeriodKey }: { initialPeriodKey: string }) {
  const [periodKey, setPeriodKey] = useState(initialPeriodKey);
  const { data, loading, error, refresh } = useModuleData(periodKey, fetchBodyData);
  const [editing, setEditing] = useState<WeightEntry | "new" | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const period = data?.period ?? getPeriod(periodKey, new Date(`${initialPeriodKey}-15T12:00:00Z`));
  const closeDialog = useCallback(() => setEditing(null), []);

  const saveEntry = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      recorded_on: String(form.get("recorded_on")),
      weight_kg: Number(form.get("weight_kg")),
      body_fat_percent: optionalNumber(form, "body_fat_percent"),
      notes: String(form.get("notes") ?? "").trim() || null,
    };
    setSaving(true);
    try {
      if (editing === "new") await createRecord<WeightEntry>("/health/weights", payload);
      else if (editing) await updateRecord<WeightEntry>(`/health/weights/${editing.id}`, payload);
      setEditing(null);
      setToast({ message: editing === "new" ? "Body check-in added" : "Body check-in updated", tone: "success" });
      refresh();
    } catch (reason) {
      setToast({ message: reason instanceof Error ? reason.message : "Could not save body data.", tone: "error" });
    } finally {
      setSaving(false);
    }
  };

  const removeEntry = async (entry: WeightEntry) => {
    if (!window.confirm(`Delete the ${shortDate(entry.recorded_on)} check-in?`)) return;
    try {
      await deleteRecord(`/health/weights/${entry.id}`);
      setToast({ message: "Body check-in deleted", tone: "success" });
      refresh();
    } catch (reason) {
      setToast({ message: reason instanceof Error ? reason.message : "Could not delete body data.", tone: "error" });
    }
  };

  const latestWeight = data?.summary.latest_weight_kg === null ? null : asNumber(data?.summary.latest_weight_kg);
  const change = data?.summary.weight_change_kg === null ? null : asNumber(data?.summary.weight_change_kg);
  const bodyFatValues = data?.entries.filter((entry) => entry.body_fat_percent !== null).map((entry) => asNumber(entry.body_fat_percent)) ?? [];
  const latestBodyFat = bodyFatValues[0] ?? null;

  return (
    <>
      <ModuleHeader eyebrow="Body" title="See the trend, not the noise." description="Record weight and body composition, then follow the long-term direction." periodKey={periodKey} initialPeriodKey={initialPeriodKey} onPeriodChange={setPeriodKey} onAdd={() => setEditing("new")} addLabel="Add check-in" />
      {data && <DataNotice loading={loading} error={error} onRetry={refresh} />}
      {!data ? <ModuleState error={error} onRetry={refresh} /> : (
        <>
          <section className="module-stats" aria-label="Body summary">
            <article className="module-stat"><span className="stat-icon forest"><Scale size={18} /></span><p>Latest weight</p><strong>{latestWeight === null ? "—" : latestWeight.toFixed(1)} <small>{latestWeight === null ? "" : "kg"}</small></strong><em>{data.entries[0] ? shortDate(data.entries[0].recorded_on) : "No check-ins"}</em></article>
            <article className="module-stat"><span className={`stat-icon ${change !== null && change <= 0 ? "lime" : "amber"}`}>{change !== null && change <= 0 ? <TrendingDown size={18} /> : <TrendingUp size={18} />}</span><p>Monthly change</p><strong>{change === null ? "—" : `${change > 0 ? "+" : ""}${change.toFixed(1)}`} <small>{change === null ? "" : "kg"}</small></strong><em>First to latest entry</em></article>
            <article className="module-stat"><span className="stat-icon blue"><Gauge size={18} /></span><p>Body fat</p><strong>{latestBodyFat === null ? "—" : latestBodyFat.toFixed(1)} <small>{latestBodyFat === null ? "" : "%"}</small></strong><em>{latestBodyFat === null ? "Optional metric" : "Latest measured value"}</em></article>
          </section>

          <section className="module-section body-trend-card">
            <div className="section-heading"><div><p className="eyebrow">Weight trend</p><h2>{period.label}</h2></div><span className="section-caption">{data.entries.length} check-ins</span></div>
            {data.entries.length > 0 ? <WeightChart entries={data.entries} /> : <EmptyState icon={<Activity size={22} />} title="No trend to show yet" description="Add two or more check-ins to make day-to-day changes easier to understand." action="Add check-in" onAction={() => setEditing("new")} />}
          </section>

          <section className="module-section">
            <div className="section-heading"><div><p className="eyebrow">Check-ins</p><h2>Body history</h2></div><span className="record-count">{data.entries.length} records</span></div>
            {data.entries.length > 0 ? (
              <div className="record-list">
                {data.entries.map((entry) => (
                  <article className="record-card" key={entry.id}>
                    <div className="record-date"><strong>{entry.recorded_on.slice(8)}</strong><span>{shortDate(entry.recorded_on).split(" ")[0]}</span></div>
                    <div className="record-primary"><h3>{asNumber(entry.weight_kg).toFixed(1)} kg</h3><p>{entry.notes || "Body check-in"}</p></div>
                    <div className="record-value">{entry.body_fat_percent === null ? <span className="muted-value">Body fat —</span> : <><strong>{asNumber(entry.body_fat_percent).toFixed(1)}%</strong><span>body fat</span></>}</div>
                    <div className="record-actions">
                      <button onClick={() => setEditing(entry)} aria-label={`Edit check-in for ${entry.recorded_on}`}><Edit3 size={16} /></button>
                      <button className="danger" onClick={() => void removeEntry(entry)} aria-label={`Delete check-in for ${entry.recorded_on}`}><Trash2 size={16} /></button>
                    </div>
                  </article>
                ))}
              </div>
            ) : <EmptyState icon={<Scale size={22} />} title="No check-ins in this month" description="Your weight and body-fat records will appear here." />}
          </section>
        </>
      )}

      <ModuleDialog open={editing !== null} title={editing === "new" ? "Add a body check-in" : "Edit body check-in"} eyebrow="Body" saving={saving} onClose={closeDialog}>
        <form className="log-form" onSubmit={saveEntry} key={editing === "new" ? "new" : editing?.id}>
          <div className="form-grid">
            <label><span>Date</span><input name="recorded_on" type="date" min={period.startDate} max={period.endDate} defaultValue={editing === "new" ? period.referenceDate : editing?.recorded_on} required /></label>
            <label><span>Weight</span><div className="input-unit"><input name="weight_kg" type="number" min="1" step="0.01" defaultValue={editing === "new" ? "" : asNumber(editing?.weight_kg)} placeholder="75.4" required /><em>kg</em></div></label>
          </div>
          <label><span>Body fat (optional)</span><div className="input-unit"><input name="body_fat_percent" type="number" min="0" max="100" step="0.01" defaultValue={editing === "new" || editing?.body_fat_percent === null ? "" : asNumber(editing?.body_fat_percent)} placeholder="18.5" /><em>%</em></div></label>
          <label><span>Notes</span><textarea name="notes" rows={3} maxLength={500} defaultValue={editing === "new" ? "" : editing?.notes ?? ""} placeholder="How you feel, measurement conditions, or context" /></label>
          <SaveActions saving={saving} onCancel={closeDialog} label={editing === "new" ? "Add check-in" : "Save changes"} />
        </form>
      </ModuleDialog>
      {toast && <ModuleToast {...toast} onClose={() => setToast(null)} />}
    </>
  );
}
