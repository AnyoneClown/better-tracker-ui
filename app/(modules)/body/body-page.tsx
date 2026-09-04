"use client";

import { Activity, Edit3, Gauge, Scale, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import type { FormEvent } from "react";
import { useCallback, useState } from "react";

import { DataNotice, EmptyState, ModuleDialog, ModuleHeader, ModuleState, ModuleToast, SaveActions } from "@/components/module-ui";
import { useModuleData } from "@/hooks/use-module-data";
import { asNumber, createRecord, deleteRecord, fetchBodyData, type WeightEntry, updateRecord } from "@/lib/module-api";
import { getPeriod } from "@/lib/tracker-api";
import { useLocale } from "@/lib/i18n";

type Toast = { message: string; tone: "success" | "error" };

function optionalNumber(form: FormData, name: string): number | null {
  const value = String(form.get(name) ?? "").trim();
  return value === "" ? null : Number(value);
}

function shortDate(date: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}

function shortMonth(date: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}

function WeightChart({ entries }: { entries: WeightEntry[] }) {
  const { intlLocale, t } = useLocale();
  const ordered = entries.slice().reverse();
  if (ordered.length === 0) return null;
  const values = ordered.map((entry) => asNumber(entry.weight_kg));
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = Math.max(maximum - minimum, 1);
  const points = ordered.length === 1
    ? [{ x: 300, y: 65 }]
    : ordered.map((entry, index) => ({ x: (index / (ordered.length - 1)) * 600, y: 16 + ((maximum - asNumber(entry.weight_kg)) / range) * 92 }));
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ");
  return (
    <div className="body-chart-wrap">
      <div className="chart-scale"><span>{maximum.toFixed(1)} {t("kg", "кг")}</span><span>{minimum.toFixed(1)} {t("kg", "кг")}</span></div>
      <svg className="body-line-chart" viewBox="0 0 600 130" preserveAspectRatio="none" role="img" aria-label={t("Weight trend", "Тренд ваги")}>
        <defs><linearGradient id="body-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#c8e77d" stopOpacity=".42" /><stop offset="1" stopColor="#c8e77d" stopOpacity="0" /></linearGradient></defs>
        {ordered.length > 1 && <path d={`${path} L600,130 L0,130 Z`} fill="url(#body-fill)" />}
        {ordered.length > 1 && <path d={path} fill="none" stroke="#245645" strokeWidth="4" vectorEffect="non-scaling-stroke" />}
        {points.map((point, index) => <circle cx={point.x} cy={point.y} r="4" key={ordered[index]?.id ?? index}><title>{shortDate(ordered[index]?.recorded_on ?? ordered[0].recorded_on, intlLocale)} · {values[index]?.toFixed(1) ?? values[0].toFixed(1)} {t("kg", "кг")}</title></circle>)}
      </svg>
      <div className="body-chart-dates"><span>{shortDate(ordered[0].recorded_on, intlLocale)}</span>{ordered.length > 1 && <span>{shortDate(ordered.at(-1)?.recorded_on ?? ordered[0].recorded_on, intlLocale)}</span>}</div>
    </div>
  );
}

export default function BodyPage({ initialPeriodKey, latestPeriodKey }: { initialPeriodKey: string; latestPeriodKey: string }) {
  const { intlLocale, t } = useLocale();
  const [periodKey, setPeriodKey] = useState(initialPeriodKey);
  const { data, loading, stale, error, refresh } = useModuleData("body", periodKey, fetchBodyData);
  const [editing, setEditing] = useState<WeightEntry | "new" | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const period = getPeriod(periodKey, new Date(), intlLocale);
  const displayPeriod = getPeriod(data?.period.key ?? periodKey, new Date(), intlLocale);
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
      setToast({ message: editing === "new" ? t("Body check-in added", "Зважування додано") : t("Body check-in updated", "Зважування оновлено"), tone: "success" });
      refresh();
    } catch (reason) {
      setToast({ message: reason instanceof Error ? reason.message : t("Could not save body data.", "Не вдалося зберегти дані."), tone: "error" });
    } finally {
      setSaving(false);
    }
  };

  const removeEntry = async (entry: WeightEntry) => {
    if (!window.confirm(t(`Delete the ${shortDate(entry.recorded_on, intlLocale)} check-in?`, `Видалити зважування за ${shortDate(entry.recorded_on, intlLocale)}?`))) return;
    try {
      await deleteRecord(`/health/weights/${entry.id}`);
      setToast({ message: t("Body check-in deleted", "Зважування видалено"), tone: "success" });
      refresh();
    } catch (reason) {
      setToast({ message: reason instanceof Error ? reason.message : t("Could not delete body data.", "Не вдалося видалити дані."), tone: "error" });
    }
  };

  const latestWeight = data?.summary.latest_weight_kg === null ? null : asNumber(data?.summary.latest_weight_kg);
  const change = data?.summary.weight_change_kg === null ? null : asNumber(data?.summary.weight_change_kg);
  const bodyFatValues = data?.entries.filter((entry) => entry.body_fat_percent !== null).map((entry) => asNumber(entry.body_fat_percent)) ?? [];
  const latestBodyFat = bodyFatValues[0] ?? null;

  return (
    <>
      <ModuleHeader eyebrow={t("Body", "Тіло")} title={t("See the trend, not the noise.", "Стежте за трендом, а не за коливаннями.")} description={t("Record weight and body composition, then follow the long-term direction.", "Записуйте вагу й склад тіла та спостерігайте за довгостроковими змінами.")} periodKey={periodKey} initialPeriodKey={latestPeriodKey} onPeriodChange={setPeriodKey} onAdd={() => setEditing("new")} addLabel={t("Add check-in", "Додати зважування")} />
      {data && <DataNotice loading={loading} error={error} onRetry={refresh} />}
      {!data ? <ModuleState error={error} onRetry={refresh} /> : (
        <div className={`refresh-surface ${loading || stale ? "is-refreshing" : ""}`} aria-busy={loading}>
          <section className="module-stats" aria-label={t("Body summary", "Підсумок тіла")}>
            <article className="module-stat"><span className="stat-icon forest"><Scale size={18} /></span><p>{t("Latest weight", "Остання вага")}</p><strong>{latestWeight === null ? "—" : latestWeight.toFixed(1)} <small>{latestWeight === null ? "" : t("kg", "кг")}</small></strong><em>{data.entries[0] ? shortDate(data.entries[0].recorded_on, intlLocale) : t("No check-ins", "Немає зважувань")}</em></article>
            <article className="module-stat"><span className="stat-icon blue">{change !== null && change <= 0 ? <TrendingDown size={18} /> : <TrendingUp size={18} />}</span><p>{t("Monthly change", "Зміна за місяць")}</p><strong>{change === null ? "—" : `${change > 0 ? "+" : ""}${change.toFixed(1)}`} <small>{change === null ? "" : t("kg", "кг")}</small></strong><em>{t("First to latest entry", "Від першого до останнього запису")}</em></article>
            <article className="module-stat"><span className="stat-icon blue"><Gauge size={18} /></span><p>{t("Body fat", "Жирова маса")}</p><strong>{latestBodyFat === null ? "—" : latestBodyFat.toFixed(1)} <small>{latestBodyFat === null ? "" : "%"}</small></strong><em>{latestBodyFat === null ? t("Optional metric", "Необов’язковий показник") : t("Latest measured value", "Останнє виміряне значення")}</em></article>
          </section>

          <section className="module-section body-trend-card">
            <div className="section-heading"><div><p className="eyebrow">{t("Weight trend", "Тренд ваги")}</p><h2>{displayPeriod.label}</h2></div><span className="section-caption">{data.entries.length} {t("check-ins", "зважувань")}</span></div>
            {data.entries.length > 0 ? <WeightChart entries={data.entries} /> : <EmptyState icon={<Activity size={22} />} title={t("No trend to show yet", "Поки немає тренду")} description={t("Add two or more check-ins to make day-to-day changes easier to understand.", "Додайте щонайменше два зважування, щоб побачити зміни.")} action={t("Add check-in", "Додати зважування")} onAction={() => setEditing("new")} />}
          </section>

          <section className="module-section">
            <div className="section-heading"><div><p className="eyebrow">{t("Check-ins", "Зважування")}</p><h2>{t("Body history", "Історія показників")}</h2></div><span className="record-count">{data.entries.length} {t("records", "записів")}</span></div>
            {data.entries.length > 0 ? (
              <div className="record-list">
                {data.entries.map((entry) => (
                  <article className="record-card" key={entry.id}>
                    <div className="record-date"><strong>{entry.recorded_on.slice(8)}</strong><span>{shortMonth(entry.recorded_on, intlLocale)}</span></div>
                    <div className="record-primary"><h3>{asNumber(entry.weight_kg).toFixed(1)} {t("kg", "кг")}</h3><p>{entry.notes || t("Body check-in", "Зважування")}</p></div>
                    <div className="record-value">{entry.body_fat_percent === null ? <span className="muted-value">{t("Body fat", "Жирова маса")} —</span> : <><strong>{asNumber(entry.body_fat_percent).toFixed(1)}%</strong><span>{t("body fat", "жиру")}</span></>}</div>
                    <div className="record-actions">
                      <button onClick={() => setEditing(entry)} aria-label={t(`Edit check-in for ${entry.recorded_on}`, `Редагувати зважування за ${entry.recorded_on}`)}><Edit3 size={16} /></button>
                      <button className="danger" onClick={() => void removeEntry(entry)} aria-label={t(`Delete check-in for ${entry.recorded_on}`, `Видалити зважування за ${entry.recorded_on}`)}><Trash2 size={16} /></button>
                    </div>
                  </article>
                ))}
              </div>
            ) : <EmptyState icon={<Scale size={22} />} title={t("No check-ins in this month", "Цього місяця зважувань немає")} description={t("Your weight and body-fat records will appear here.", "Тут з’являться записи ваги та жирової маси.")} />}
          </section>
        </div>
      )}

      <ModuleDialog open={editing !== null} title={editing === "new" ? t("Add a body check-in", "Додати зважування") : t("Edit body check-in", "Редагувати зважування")} eyebrow={t("Body", "Тіло")} saving={saving} onClose={closeDialog}>
        <form className="log-form" onSubmit={saveEntry} key={editing === "new" ? "new" : editing?.id}>
          <div className="form-grid">
            <label><span>{t("Date", "Дата")}</span><input name="recorded_on" type="date" min={period.startDate} max={period.endDate} defaultValue={editing === "new" ? period.referenceDate : editing?.recorded_on} required /></label>
            <label><span>{t("Weight", "Вага")}</span><div className="input-unit"><input name="weight_kg" type="number" min="1" step="0.01" defaultValue={editing === "new" ? "" : asNumber(editing?.weight_kg)} placeholder="75.4" required /><em>{t("kg", "кг")}</em></div></label>
          </div>
          <label><span>{t("Body fat (optional)", "Жирова маса (необов’язково)")}</span><div className="input-unit"><input name="body_fat_percent" type="number" min="0" max="100" step="0.01" defaultValue={editing === "new" || editing?.body_fat_percent === null ? "" : asNumber(editing?.body_fat_percent)} placeholder="18.5" /><em>%</em></div></label>
          <label><span>{t("Notes", "Примітки")}</span><textarea name="notes" rows={3} maxLength={500} defaultValue={editing === "new" ? "" : editing?.notes ?? ""} placeholder={t("How you feel, measurement conditions, or context", "Самопочуття, умови вимірювання або контекст")} /></label>
          <SaveActions saving={saving} onCancel={closeDialog} label={editing === "new" ? t("Add check-in", "Додати зважування") : t("Save changes", "Зберегти зміни")} />
        </form>
      </ModuleDialog>
      {toast && <ModuleToast {...toast} onClose={() => setToast(null)} />}
    </>
  );
}
