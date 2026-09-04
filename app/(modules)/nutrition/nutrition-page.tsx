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
import { useLocale } from "@/lib/i18n";

type Toast = { message: string; tone: "success" | "error" };

function optionalNumber(form: FormData, name: string): number | null {
  const value = String(form.get(name) ?? "").trim();
  return value === "" ? null : Number(value);
}

function shortDate(date: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "UTC" })
    .format(new Date(`${date}T12:00:00Z`));
}

function shortMonth(date: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" })
    .format(new Date(`${date}T12:00:00Z`));
}

export default function NutritionPage({ initialPeriodKey, latestPeriodKey }: { initialPeriodKey: string; latestPeriodKey: string }) {
  const { intlLocale, t } = useLocale();
  const [periodKey, setPeriodKey] = useState(initialPeriodKey);
  const { data, loading, stale, error, refresh } = useModuleData(periodKey, fetchNutritionData);
  const [editing, setEditing] = useState<NutritionLog | "new" | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const period = getPeriod(periodKey, new Date(), intlLocale);
  const displayPeriod = getPeriod(data?.period.key ?? periodKey, new Date(), intlLocale);
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
      setToast({ message: editing === "new" ? t("Nutrition day added", "День харчування додано") : t("Nutrition day updated", "День харчування оновлено"), tone: "success" });
      refresh();
    } catch (reason) {
      setToast({ message: reason instanceof Error ? reason.message : t("Could not save nutrition data.", "Не вдалося зберегти дані про харчування."), tone: "error" });
    } finally {
      setSaving(false);
    }
  };

  const removeLog = async (log: NutritionLog) => {
    if (!window.confirm(t(`Delete the nutrition log for ${shortDate(log.recorded_on, intlLocale)}?`, `Видалити запис харчування за ${shortDate(log.recorded_on, intlLocale)}?`))) return;
    try {
      await deleteRecord(`/health/nutrition/${log.id}`);
      setToast({ message: t("Nutrition day deleted", "День харчування видалено"), tone: "success" });
      refresh();
    } catch (reason) {
      setToast({ message: reason instanceof Error ? reason.message : t("Could not delete nutrition data.", "Не вдалося видалити дані про харчування."), tone: "error" });
    }
  };

  const averageCalories = asNumber(data?.summary.average_daily_calories);
  const averageTarget = asNumber(data?.summary.average_calorie_target);
  const proteinLogs = data?.logs.filter((log) => log.protein_grams !== null) ?? [];
  const averageProtein = proteinLogs.length
    ? proteinLogs.reduce((sum, log) => sum + asNumber(log.protein_grams), 0) / proteinLogs.length
    : null;
  const targetProgress = averageTarget > 0 ? Math.min((averageCalories / averageTarget) * 100, 100) : 0;
  const chartMaximum = Math.max(1, ...(data?.logs.flatMap((log) => [log.calories, log.calorie_target ?? 0]) ?? []));

  return (
    <>
      <ModuleHeader
        eyebrow={t("Nutrition", "Харчування")}
        title={t("Fuel the work.", "Живіть з енергією.")}
        description={t("Log daily calorie and macro totals, then compare them on one consistent scale.", "Записуйте денні підсумки калорій і макронутрієнтів та порівнюйте їх в одному масштабі.")}
        periodKey={periodKey}
        initialPeriodKey={latestPeriodKey}
        onPeriodChange={setPeriodKey}
        onAdd={() => setEditing("new")}
        addLabel={t("Log nutrition", "Записати харчування")}
      />

      {data && <DataNotice loading={loading} error={error} onRetry={refresh} />}
      {!data ? <ModuleState error={error} onRetry={refresh} /> : (
        <div className={`refresh-surface ${loading || stale ? "is-refreshing" : ""}`} aria-busy={loading}>
          <section className="module-stats" aria-label={t("Nutrition summary", "Підсумок харчування")}>
            <article className="module-stat"><span className="stat-icon lime"><Flame size={18} /></span><p>{t("Daily average", "У середньому за день")}</p><strong>{Math.round(averageCalories).toLocaleString(intlLocale)} <small>{t("kcal", "ккал")}</small></strong><em>{t(`${data.summary.nutrition_days_logged} days logged`, `Записано днів: ${data.summary.nutrition_days_logged}`)}</em></article>
            <article className="module-stat"><span className="stat-icon forest"><Target size={18} /></span><p>{t("Average target", "Середня ціль")}</p><strong>{averageTarget ? Math.round(averageTarget).toLocaleString(intlLocale) : "—"} <small>{averageTarget ? t("kcal", "ккал") : ""}</small></strong><em>{averageTarget ? `${Math.round(targetProgress)}% ${t("of target", "від цілі")}` : t("Add a target to your logs", "Додайте ціль до записів")}</em></article>
            <article className="module-stat"><span className="stat-icon amber"><Apple size={18} /></span><p>{t("Average protein", "Білка в середньому")}</p><strong>{averageProtein === null ? "—" : Math.round(averageProtein)} <small>{averageProtein === null ? "" : t("g/day", "г/день")}</small></strong><em>{proteinLogs.length ? t(`Across ${proteinLogs.length} tracked days`, `За ${proteinLogs.length} відстежених днів`) : t("Add protein to a daily log", "Додайте білок до денного запису")}</em></article>
          </section>

          <section className="module-section nutrition-chart-card">
            <div className="section-heading"><div><p className="eyebrow">{t("Daily rhythm", "Щоденний ритм")}</p><h2>{t("Calories across", "Калорії за")} {displayPeriod.label}</h2></div><span className="section-caption">{t("Target shown per day", "Ціль показано для кожного дня")}</span></div>
            {data.logs.length > 0 ? (
              <div className="nutrition-bars" aria-label={t("Daily calories chart", "Графік калорій за днями")}>
                {data.logs.slice().reverse().map((log) => {
                  return (
                    <div className="nutrition-day" key={log.id} title={`${log.recorded_on}: ${log.calories} ${t("kcal", "ккал")}`}>
                      <div className="nutrition-bar-track">
                        {log.calorie_target && <span className="target-line" style={{ bottom: `${Math.min((log.calorie_target / chartMaximum) * 100, 96)}%` }} />}
                        <span className="nutrition-bar" style={{ height: `${Math.max((log.calories / chartMaximum) * 100, 4)}%` }} />
                      </div>
                      <small>{log.recorded_on.slice(8)}</small>
                    </div>
                  );
                })}
              </div>
            ) : <EmptyState icon={<Utensils size={22} />} title={t("No nutrition days yet", "Записів харчування ще немає")} description={t(`Log your first day in ${displayPeriod.label} to see calorie and macro trends.`, `Додайте перший день за ${displayPeriod.label}, щоб побачити тренди калорій і макронутрієнтів.`)} action={t("Log nutrition", "Записати харчування")} onAction={() => setEditing("new")} />}
          </section>

          <section className="module-section">
            <div className="section-heading"><div><p className="eyebrow">{t("Daily totals", "Денні підсумки")}</p><h2>{t("Nutrition log", "Журнал харчування")}</h2></div><span className="record-count">{data.logs.length} {t("records", "записів")}</span></div>
            {data.logs.length > 0 ? (
              <div className="record-list">
                {data.logs.map((log) => (
                  <article className="record-card" key={log.id}>
                    <div className="record-date"><strong>{log.recorded_on.slice(8)}</strong><span>{shortMonth(log.recorded_on, intlLocale)}</span></div>
                    <div className="record-primary"><h3>{log.notes || t("Daily nutrition", "Харчування за день")}</h3><p>{log.calorie_target ? `${log.calories.toLocaleString(intlLocale)} ${t("of", "з")} ${log.calorie_target.toLocaleString(intlLocale)} ${t("kcal", "ккал")}` : `${log.calories.toLocaleString(intlLocale)} ${t("kcal", "ккал")}`}</p></div>
                    <div className="macro-pills">
                      <span>{t("P", "Б")} <strong>{asNumber(log.protein_grams)}{t("g", "г")}</strong></span>
                      <span>{t("C", "В")} <strong>{asNumber(log.carbs_grams)}{t("g", "г")}</strong></span>
                      <span>{t("F", "Ж")} <strong>{asNumber(log.fat_grams)}{t("g", "г")}</strong></span>
                    </div>
                    <div className="record-actions">
                      <button onClick={() => setEditing(log)} aria-label={t(`Edit nutrition for ${log.recorded_on}`, `Редагувати харчування за ${log.recorded_on}`)}><Edit3 size={16} /></button>
                      <button className="danger" onClick={() => void removeLog(log)} aria-label={t(`Delete nutrition for ${log.recorded_on}`, `Видалити харчування за ${log.recorded_on}`)}><Trash2 size={16} /></button>
                    </div>
                  </article>
                ))}
              </div>
            ) : <EmptyState icon={<Utensils size={22} />} title={t("Your log is clear", "Журнал порожній")} description={t("Nutrition records you add will appear here.", "Тут з’являться ваші записи про харчування.")} />}
          </section>
        </div>
      )}

      <ModuleDialog open={editing !== null} title={editing === "new" ? t("Log a nutrition day", "Записати день харчування") : t("Edit nutrition day", "Редагувати день харчування")} eyebrow={t("Nutrition", "Харчування")} saving={saving} onClose={closeDialog}>
        <form className="log-form" onSubmit={saveLog} key={editing === "new" ? "new" : editing?.id}>
          <div className="form-grid">
            <label><span>{t("Date", "Дата")}</span><input name="recorded_on" type="date" min={period.startDate} max={period.endDate} defaultValue={editing === "new" ? period.referenceDate : editing?.recorded_on} required /></label>
            <label><span>{t("Calories", "Калорії")}</span><div className="input-unit"><input name="calories" type="number" min="0" step="1" defaultValue={editing === "new" ? "" : editing?.calories} placeholder="2100" required /><em>{t("kcal", "ккал")}</em></div></label>
          </div>
          <label><span>{t("Calorie target", "Ціль калорій")}</span><div className="input-unit"><input name="calorie_target" type="number" min="1" step="1" defaultValue={editing === "new" ? "" : editing?.calorie_target ?? ""} placeholder="2300" /><em>{t("kcal", "ккал")}</em></div></label>
          <div className="form-grid form-grid-three">
            <label><span>{t("Protein", "Білок")}</span><div className="input-unit"><input name="protein_grams" type="number" min="0" step="0.1" defaultValue={editing === "new" ? "" : asNumber(editing?.protein_grams)} placeholder="150" /><em>{t("g", "г")}</em></div></label>
            <label><span>{t("Carbs", "Вуглеводи")}</span><div className="input-unit"><input name="carbs_grams" type="number" min="0" step="0.1" defaultValue={editing === "new" ? "" : asNumber(editing?.carbs_grams)} placeholder="220" /><em>{t("g", "г")}</em></div></label>
            <label><span>{t("Fat", "Жири")}</span><div className="input-unit"><input name="fat_grams" type="number" min="0" step="0.1" defaultValue={editing === "new" ? "" : asNumber(editing?.fat_grams)} placeholder="70" /><em>{t("g", "г")}</em></div></label>
          </div>
          <label><span>{t("Notes", "Примітки")}</span><textarea name="notes" rows={3} maxLength={500} defaultValue={editing === "new" ? "" : editing?.notes ?? ""} placeholder={t("Meals, prep, appetite, or anything useful", "Прийоми їжі, приготування, апетит або інші деталі")} /></label>
          <SaveActions saving={saving} onCancel={closeDialog} label={editing === "new" ? t("Add nutrition", "Додати харчування") : t("Save changes", "Зберегти зміни")} />
        </form>
      </ModuleDialog>
      {toast && <ModuleToast {...toast} onClose={() => setToast(null)} />}
    </>
  );
}
