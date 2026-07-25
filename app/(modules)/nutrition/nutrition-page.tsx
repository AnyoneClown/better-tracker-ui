"use client";

import { Apple, Edit3, Flame, Target, Trash2, Utensils } from "lucide-react";
import type { FormEvent } from "react";
import { useCallback, useState } from "react";

import {
  DataNotice,
  EmptyState,
  ModuleDialog,
  ModuleHeader,
  ModuleState,
  ModuleToast,
  SaveActions,
} from "@/components/module-ui";
import { useModuleData } from "@/hooks/use-module-data";
import {
  asNumber,
  createRecord,
  deleteRecord,
  fetchNutritionData,
  type NutritionLog,
  updateRecord,
} from "@/lib/module-api";
import { getPeriod } from "@/lib/tracker-api";

type Toast = { message: string; tone: "success" | "error" };

function optionalNumber(form: FormData, name: string): number | null {
  const value = String(form.get(name) ?? "").trim();
  return value === "" ? null : Number(value);
}

function shortDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
    .format(new Date(`${date}T12:00:00Z`));
}

export default function NutritionPage({ initialPeriodKey }: { initialPeriodKey: string }) {
  const [periodKey, setPeriodKey] = useState(initialPeriodKey);
  const { data, loading, error, refresh } = useModuleData(periodKey, fetchNutritionData);
  const [editing, setEditing] = useState<NutritionLog | "new" | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const period = data?.period ?? getPeriod(periodKey, new Date(`${initialPeriodKey}-15T12:00:00Z`));
  const closeDialog = useCallback(() => setEditing(null), []);

  const saveLog = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      recorded_on: String(form.get("recorded_on")),
      calories: Number(form.get("calories")),
      calorie_target: optionalNumber(form, "calorie_target"),
      protein_grams: optionalNumber(form, "protein_grams"),
      carbs_grams: optionalNumber(form, "carbs_grams"),
      fat_grams: optionalNumber(form, "fat_grams"),
      notes: String(form.get("notes") ?? "").trim() || null,
    };
    setSaving(true);
    try {
      if (editing === "new") await createRecord<NutritionLog>("/health/nutrition", payload);
      else if (editing) await updateRecord<NutritionLog>(`/health/nutrition/${editing.id}`, payload);
      setEditing(null);
      setToast({ message: editing === "new" ? "Nutrition day added" : "Nutrition day updated", tone: "success" });
      refresh();
    } catch (reason) {
      setToast({ message: reason instanceof Error ? reason.message : "Could not save nutrition data.", tone: "error" });
    } finally {
      setSaving(false);
    }
  };

  const removeLog = async (log: NutritionLog) => {
    if (!window.confirm(`Delete the nutrition log for ${shortDate(log.recorded_on)}?`)) return;
    try {
      await deleteRecord(`/health/nutrition/${log.id}`);
      setToast({ message: "Nutrition day deleted", tone: "success" });
      refresh();
    } catch (reason) {
      setToast({ message: reason instanceof Error ? reason.message : "Could not delete nutrition data.", tone: "error" });
    }
  };

  const averageCalories = asNumber(data?.summary.average_daily_calories);
  const averageTarget = asNumber(data?.summary.average_calorie_target);
  const totalProtein = data?.logs.reduce((sum, log) => sum + asNumber(log.protein_grams), 0) ?? 0;
  const targetProgress = averageTarget > 0 ? Math.min((averageCalories / averageTarget) * 100, 100) : 0;

  return (
    <>
      <ModuleHeader
        eyebrow="Nutrition"
        title="Fuel the work."
        description="Track calories, targets, and macros day by day from your live backend."
        periodKey={periodKey}
        initialPeriodKey={initialPeriodKey}
        onPeriodChange={setPeriodKey}
        onAdd={() => setEditing("new")}
        addLabel="Log nutrition"
      />

      {data && <DataNotice loading={loading} error={error} onRetry={refresh} />}
      {!data ? <ModuleState error={error} onRetry={refresh} /> : (
        <>
          <section className="module-stats" aria-label="Nutrition summary">
            <article className="module-stat"><span className="stat-icon lime"><Flame size={18} /></span><p>Daily average</p><strong>{Math.round(averageCalories).toLocaleString()} <small>kcal</small></strong><em>{data.summary.nutrition_days_logged} days logged</em></article>
            <article className="module-stat"><span className="stat-icon forest"><Target size={18} /></span><p>Average target</p><strong>{averageTarget ? Math.round(averageTarget).toLocaleString() : "—"} <small>{averageTarget ? "kcal" : ""}</small></strong><em>{averageTarget ? `${Math.round(targetProgress)}% of target` : "Add a target to your logs"}</em></article>
            <article className="module-stat"><span className="stat-icon amber"><Apple size={18} /></span><p>Total protein</p><strong>{Math.round(totalProtein)} <small>g</small></strong><em>Across {data.logs.length} entries</em></article>
          </section>

          <section className="module-section nutrition-chart-card">
            <div className="section-heading"><div><p className="eyebrow">Daily rhythm</p><h2>Calories across {period.label}</h2></div><span className="section-caption">Target shown per day</span></div>
            {data.logs.length > 0 ? (
              <div className="nutrition-bars" aria-label="Daily calories chart">
                {data.logs.slice().reverse().map((log) => {
                  const maximum = Math.max(log.calories, log.calorie_target ?? 0, 1);
                  return (
                    <div className="nutrition-day" key={log.id} title={`${log.recorded_on}: ${log.calories} kcal`}>
                      <div className="nutrition-bar-track">
                        {log.calorie_target && <span className="target-line" style={{ bottom: `${Math.min((log.calorie_target / maximum) * 100, 96)}%` }} />}
                        <span className="nutrition-bar" style={{ height: `${Math.max((log.calories / maximum) * 100, 4)}%` }} />
                      </div>
                      <small>{log.recorded_on.slice(8)}</small>
                    </div>
                  );
                })}
              </div>
            ) : <EmptyState icon={<Utensils size={22} />} title="No nutrition days yet" description={`Log your first day in ${period.label} to see calorie and macro trends.`} action="Log nutrition" onAction={() => setEditing("new")} />}
          </section>

          <section className="module-section">
            <div className="section-heading"><div><p className="eyebrow">Food log</p><h2>Daily nutrition</h2></div><span className="record-count">{data.logs.length} records</span></div>
            {data.logs.length > 0 ? (
              <div className="record-list">
                {data.logs.map((log) => (
                  <article className="record-card" key={log.id}>
                    <div className="record-date"><strong>{log.recorded_on.slice(8)}</strong><span>{shortDate(log.recorded_on).split(" ")[0]}</span></div>
                    <div className="record-primary"><h3>{log.notes || "Daily nutrition"}</h3><p>{log.calorie_target ? `${log.calories.toLocaleString()} of ${log.calorie_target.toLocaleString()} kcal` : `${log.calories.toLocaleString()} kcal`}</p></div>
                    <div className="macro-pills">
                      <span>P <strong>{asNumber(log.protein_grams)}g</strong></span>
                      <span>C <strong>{asNumber(log.carbs_grams)}g</strong></span>
                      <span>F <strong>{asNumber(log.fat_grams)}g</strong></span>
                    </div>
                    <div className="record-actions">
                      <button onClick={() => setEditing(log)} aria-label={`Edit nutrition for ${log.recorded_on}`}><Edit3 size={16} /></button>
                      <button className="danger" onClick={() => void removeLog(log)} aria-label={`Delete nutrition for ${log.recorded_on}`}><Trash2 size={16} /></button>
                    </div>
                  </article>
                ))}
              </div>
            ) : <EmptyState icon={<Utensils size={22} />} title="Your log is clear" description="Nutrition records you add will appear here." />}
          </section>
        </>
      )}

      <ModuleDialog open={editing !== null} title={editing === "new" ? "Log a nutrition day" : "Edit nutrition day"} eyebrow="Nutrition" saving={saving} onClose={closeDialog}>
        <form className="log-form" onSubmit={saveLog} key={editing === "new" ? "new" : editing?.id}>
          <div className="form-grid">
            <label><span>Date</span><input name="recorded_on" type="date" min={period.startDate} max={period.endDate} defaultValue={editing === "new" ? period.referenceDate : editing?.recorded_on} required /></label>
            <label><span>Calories</span><div className="input-unit"><input name="calories" type="number" min="0" step="1" defaultValue={editing === "new" ? 2100 : editing?.calories} required /><em>kcal</em></div></label>
          </div>
          <label><span>Calorie target</span><div className="input-unit"><input name="calorie_target" type="number" min="1" step="1" defaultValue={editing === "new" ? 2300 : editing?.calorie_target ?? ""} /><em>kcal</em></div></label>
          <div className="form-grid form-grid-three">
            <label><span>Protein</span><div className="input-unit"><input name="protein_grams" type="number" min="0" step="0.1" defaultValue={editing === "new" ? 150 : asNumber(editing?.protein_grams)} /><em>g</em></div></label>
            <label><span>Carbs</span><div className="input-unit"><input name="carbs_grams" type="number" min="0" step="0.1" defaultValue={editing === "new" ? 220 : asNumber(editing?.carbs_grams)} /><em>g</em></div></label>
            <label><span>Fat</span><div className="input-unit"><input name="fat_grams" type="number" min="0" step="0.1" defaultValue={editing === "new" ? 70 : asNumber(editing?.fat_grams)} /><em>g</em></div></label>
          </div>
          <label><span>Notes</span><textarea name="notes" rows={3} maxLength={500} defaultValue={editing === "new" ? "" : editing?.notes ?? ""} placeholder="Meals, prep, appetite, or anything useful" /></label>
          <SaveActions saving={saving} onCancel={closeDialog} label={editing === "new" ? "Add nutrition" : "Save changes"} />
        </form>
      </ModuleDialog>
      {toast && <ModuleToast {...toast} onClose={() => setToast(null)} />}
    </>
  );
}
