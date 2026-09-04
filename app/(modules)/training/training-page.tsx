"use client";

import { Activity, Clock3, Dumbbell, Edit3, Plus, Route, Trash2, Trophy, X } from "lucide-react";
import type { FormEvent } from "react";
import { useCallback, useState } from "react";

import { DataNotice, EmptyState, ModuleDialog, ModuleHeader, ModuleState, ModuleToast, SaveActions } from "@/components/module-ui";
import { useModuleData } from "@/hooks/use-module-data";
import { asNumber, createRecord, deleteRecord, fetchTrainingData, type Workout, type WorkoutSet, updateRecord } from "@/lib/module-api";
import { getPeriod } from "@/lib/tracker-api";
import { useLocale } from "@/lib/i18n";

type Toast = { message: string; tone: "success" | "error" };
type SetDraft = {
  id: string;
  exercise: string;
  reps: string;
  weight: string;
  distance: string;
  duration: string;
  notes: string;
};

function createSetDraft(set?: WorkoutSet): SetDraft {
  return {
    id: crypto.randomUUID(),
    exercise: set?.exercise ?? "",
    reps: set?.reps === null || set?.reps === undefined ? "" : String(set.reps),
    weight: set?.weight_kg === null || set?.weight_kg === undefined ? "" : String(set.weight_kg),
    distance: set?.distance_km === null || set?.distance_km === undefined ? "" : String(set.distance_km),
    duration: set?.duration_seconds === null || set?.duration_seconds === undefined ? "" : String(set.duration_seconds),
    notes: set?.notes ?? "",
  };
}

function dateTimeLocal(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function formatWorkoutDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

function formatDuration(minutes: number, ukrainian: boolean): string {
  if (minutes < 60) return `${minutes} ${ukrainian ? "хв" : "min"}`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}${ukrainian ? "год" : "h"} ${rest}${ukrainian ? "хв" : "m"}` : `${hours}${ukrainian ? "год" : "h"}`;
}

export default function TrainingPage({ initialPeriodKey, latestPeriodKey }: { initialPeriodKey: string; latestPeriodKey: string }) {
  const { locale, intlLocale, t } = useLocale();
  const [periodKey, setPeriodKey] = useState(initialPeriodKey);
  const { data, loading, stale, error, refresh } = useModuleData(periodKey, fetchTrainingData);
  const [editing, setEditing] = useState<Workout | "new" | null>(null);
  const [setDrafts, setSetDrafts] = useState<SetDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const period = getPeriod(periodKey, new Date(), intlLocale);
  const displayPeriod = getPeriod(data?.period.key ?? periodKey, new Date(), intlLocale);
  const closeDialog = useCallback(() => setEditing(null), []);

  const openNew = () => {
    setSetDrafts([]);
    setEditing("new");
  };

  const openEdit = (workout: Workout) => {
    setSetDrafts(workout.sets.map((set) => createSetDraft(set)));
    setEditing(workout);
  };

  const updateSet = (id: string, field: keyof Omit<SetDraft, "id">, value: string) => {
    setSetDrafts((sets) => sets.map((set) => set.id === id ? { ...set, [field]: value } : set));
  };

  const saveWorkout = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const invalid = setDrafts.find((set) => !set.exercise.trim() || ![set.reps, set.weight, set.distance, set.duration].some((value) => value !== ""));
    if (invalid) {
      setToast({ message: t("Every exercise set needs a name and at least one metric.", "Кожен підхід має містити назву вправи та хоча б один показник."), tone: "error" });
      return;
    }
    const form = new FormData(event.currentTarget);
    const counts = new Map<string, number>();
    const sets = setDrafts.map((set) => {
      const exercise = set.exercise.trim();
      const setNumber = (counts.get(exercise) ?? 0) + 1;
      counts.set(exercise, setNumber);
      return {
        exercise,
        set_number: setNumber,
        reps: set.reps === "" ? null : Number(set.reps),
        weight_kg: set.weight === "" ? null : Number(set.weight),
        distance_km: set.distance === "" ? null : Number(set.distance),
        duration_seconds: set.duration === "" ? null : Number(set.duration),
        notes: set.notes.trim() || null,
      };
    });
    const duration = String(form.get("duration_minutes") ?? "").trim();
    const payload = {
      name: String(form.get("name")).trim(),
      performed_at: new Date(String(form.get("performed_at"))).toISOString(),
      duration_minutes: duration === "" ? null : Number(duration),
      notes: String(form.get("notes") ?? "").trim() || null,
      sets,
    };
    setSaving(true);
    try {
      if (editing === "new") await createRecord<Workout>("/workouts", payload);
      else if (editing) await updateRecord<Workout>(`/workouts/${editing.id}`, payload);
      setEditing(null);
      setToast({ message: editing === "new" ? t("Workout added", "Тренування додано") : t("Workout updated", "Тренування оновлено"), tone: "success" });
      refresh();
    } catch (reason) {
      setToast({ message: reason instanceof Error ? reason.message : t("Could not save the workout.", "Не вдалося зберегти тренування."), tone: "error" });
    } finally {
      setSaving(false);
    }
  };

  const removeWorkout = async (workout: Workout) => {
    if (!window.confirm(t(`Delete “${workout.name}”?`, `Видалити «${workout.name}»?`))) return;
    try {
      await deleteRecord(`/workouts/${workout.id}`);
      setToast({ message: t("Workout deleted", "Тренування видалено"), tone: "success" });
      refresh();
    } catch (reason) {
      setToast({ message: reason instanceof Error ? reason.message : t("Could not delete the workout.", "Не вдалося видалити тренування."), tone: "error" });
    }
  };

  const summary = data?.summary;
  const average = summary?.average_duration_minutes === null ? null : asNumber(summary?.average_duration_minutes);

  return (
    <>
      <ModuleHeader eyebrow={t("Training", "Тренування")} title={t("Put the work on record.", "Записуйте виконану роботу.")} description={t("Plan less from memory: log sessions, exercises, sets, reps, load, distance, and time.", "Фіксуйте тренування, вправи, підходи, повтори, вагу, відстань і час.")} periodKey={periodKey} initialPeriodKey={latestPeriodKey} onPeriodChange={setPeriodKey} onAdd={openNew} addLabel={t("Add workout", "Додати тренування")} />
      {data && <DataNotice loading={loading} error={error} onRetry={refresh} />}
      {!data ? <ModuleState error={error} onRetry={refresh} /> : (
        <div className={`refresh-surface ${loading || stale ? "is-refreshing" : ""}`} aria-busy={loading}>
          <section className="module-stats module-stats-four" aria-label={t("Training summary", "Підсумок тренувань")}>
            <article className="module-stat"><span className="stat-icon forest"><Dumbbell size={18} /></span><p>{t("Sessions", "Тренування")}</p><strong>{summary?.workout_count ?? 0}</strong><em>{summary?.total_sets ?? 0} {t("total sets", "підходів")}</em></article>
            <article className="module-stat"><span className="stat-icon lime"><Clock3 size={18} /></span><p>{t("Training time", "Час тренувань")}</p><strong>{formatDuration(summary?.total_duration_minutes ?? 0, locale === "uk")}</strong><em>{average === null ? t("No duration average", "Немає середньої тривалості") : `${Math.round(average)} ${t("min average", "хв у середньому")}`}</em></article>
            <article className="module-stat"><span className="stat-icon amber"><Trophy size={18} /></span><p>{t("Volume", "Обсяг")}</p><strong>{Math.round(asNumber(summary?.total_volume_kg)).toLocaleString(intlLocale)} <small>{t("kg", "кг")}</small></strong><em>{summary?.total_reps ?? 0} {t("total reps", "повторів")}</em></article>
            <article className="module-stat"><span className="stat-icon blue"><Route size={18} /></span><p>{t("Distance", "Відстань")}</p><strong>{asNumber(summary?.total_distance_km).toFixed(1)} <small>{t("km", "км")}</small></strong><em>{summary?.total_set_duration_seconds ?? 0} {t("active seconds", "активних секунд")}</em></article>
          </section>

          <div className="module-two-column training-layout">
            <section className="module-section">
              <div className="section-heading"><div><p className="eyebrow">{t("Session log", "Журнал тренувань")}</p><h2>{t("Workouts for", "Тренування за")} {displayPeriod.label}</h2></div><span className="record-count">{data.workouts.length} {t("sessions", "тренувань")}</span></div>
              {data.workouts.length > 0 ? (
                <div className="workout-list">
                  {data.workouts.map((workout) => {
                    const exercises = Array.from(new Set(workout.sets.map((set) => set.exercise)));
                    return (
                      <article className="workout-record" key={workout.id}>
                        <div className="workout-record-top">
                          <div className="workout-symbol"><Dumbbell size={19} /></div>
                          <div className="record-primary"><h3>{workout.name}</h3><p>{formatWorkoutDate(workout.performed_at, intlLocale)}{workout.duration_minutes ? ` · ${formatDuration(workout.duration_minutes, locale === "uk")}` : ""}</p></div>
                          <div className="record-actions">
                            <button onClick={() => openEdit(workout)} aria-label={t(`Edit ${workout.name}`, `Редагувати ${workout.name}`)}><Edit3 size={16} /></button>
                            <button className="danger" onClick={() => void removeWorkout(workout)} aria-label={t(`Delete ${workout.name}`, `Видалити ${workout.name}`)}><Trash2 size={16} /></button>
                          </div>
                        </div>
                        {exercises.length > 0 ? <div className="exercise-tags">{exercises.map((exercise) => <span key={exercise}>{exercise}<small>{workout.sets.filter((set) => set.exercise === exercise).length} {t("sets", "підходів")}</small></span>)}</div> : <p className="workout-note">{t("No sets recorded for this session.", "Для цього тренування підходів не записано.")}</p>}
                        {workout.notes && <p className="workout-note">{workout.notes}</p>}
                      </article>
                    );
                  })}
                </div>
              ) : <EmptyState icon={<Dumbbell size={22} />} title={t("No workouts this month", "Цього місяця тренувань немає")} description={t("Add your first session, then track sets and performance over time.", "Додайте перше тренування та відстежуйте підходи й результати.")} action={t("Add workout", "Додати тренування")} onAction={openNew} />}
            </section>

            <section className="module-section exercise-summary">
              <div className="section-heading"><div><p className="eyebrow">{t("Exercise totals", "Підсумки вправ")}</p><h2>{t("Work performed", "Виконана робота")}</h2></div></div>
              {summary && summary.exercises.length > 0 ? (
                <div className="exercise-table">
                  {summary.exercises.map((exercise) => (
                    <div className="exercise-row" key={exercise.exercise}>
                      <div><strong>{exercise.exercise}</strong><span>{exercise.sets} {t("sets", "підходів")} · {exercise.total_reps} {t("reps", "повторів")}</span></div>
                      <div><strong>{Math.round(asNumber(exercise.volume_kg)).toLocaleString(intlLocale)} {t("kg", "кг")}</strong><span>{asNumber(exercise.distance_km) > 0 ? `${asNumber(exercise.distance_km).toFixed(1)} ${t("km", "км")}` : exercise.duration_seconds > 0 ? `${exercise.duration_seconds}${t("s", "с")}` : t("volume", "обсяг")}</span></div>
                    </div>
                  ))}
                </div>
              ) : <EmptyState icon={<Activity size={22} />} title={t("No exercise totals yet", "Підсумків вправ ще немає")} description={t("Sets with reps, weight, distance, or time will roll up here.", "Тут з’являться підсумки повторів, ваги, відстані та часу.")} />}
            </section>
          </div>
        </div>
      )}

      <ModuleDialog open={editing !== null} title={editing === "new" ? t("Add a workout", "Додати тренування") : t("Edit workout", "Редагувати тренування")} eyebrow={t("Training", "Тренування")} saving={saving} onClose={closeDialog}>
        <form className="log-form workout-form" onSubmit={saveWorkout} key={editing === "new" ? "new" : editing?.id}>
          <label><span>{t("Session name", "Назва тренування")}</span><input name="name" maxLength={200} defaultValue={editing === "new" ? "" : editing?.name} placeholder={t("Lower body strength", "Силове тренування ніг")} required /></label>
          <div className="form-grid">
            <label><span>{t("Date and time", "Дата й час")}</span><input name="performed_at" type="datetime-local" min={`${period.startDate}T00:00`} max={`${period.endDate}T23:59`} defaultValue={editing === "new" ? `${period.referenceDate}T18:00` : dateTimeLocal(editing?.performed_at ?? "")} required /></label>
            <label><span>{t("Duration", "Тривалість")}</span><div className="input-unit"><input name="duration_minutes" type="number" min="1" defaultValue={editing === "new" ? "" : editing?.duration_minutes ?? ""} placeholder="60" /><em>{t("min", "хв")}</em></div></label>
          </div>
          <label><span>{t("Notes", "Примітки")}</span><textarea name="notes" rows={2} defaultValue={editing === "new" ? "" : editing?.notes ?? ""} placeholder={t("Energy, focus, or session notes", "Енергія, концентрація або нотатки про тренування")} /></label>

          <div className="sets-heading"><div><span>{t("Exercise sets", "Підходи")}</span><small>{t("Add whichever metric makes sense for the movement.", "Додайте доречні для вправи показники.")}</small></div><button type="button" className="secondary-button" onClick={() => setSetDrafts((sets) => [...sets, createSetDraft()])}><Plus size={15} /> {t("Add set", "Додати підхід")}</button></div>
          <div className="set-editor-list">
            {setDrafts.map((set, index) => (
              <div className="set-editor" key={set.id}>
                <span className="set-number">{index + 1}</span>
                <label className="set-exercise"><span>{t("Exercise", "Вправа")}</span><input value={set.exercise} onChange={(event) => updateSet(set.id, "exercise", event.target.value)} placeholder={t("Squat", "Присідання")} required /></label>
                <label><span>{t("Reps", "Повтори")}</span><input type="number" min="0" value={set.reps} onChange={(event) => updateSet(set.id, "reps", event.target.value)} placeholder="8" /></label>
                <label><span>{t("kg", "кг")}</span><input type="number" min="0" step="0.001" value={set.weight} onChange={(event) => updateSet(set.id, "weight", event.target.value)} placeholder="80" /></label>
                <label><span>{t("km", "км")}</span><input type="number" min="0" step="0.001" value={set.distance} onChange={(event) => updateSet(set.id, "distance", event.target.value)} placeholder="—" /></label>
                <label><span>{t("Seconds", "Секунди")}</span><input type="number" min="0" value={set.duration} onChange={(event) => updateSet(set.id, "duration", event.target.value)} placeholder="—" /></label>
                <button type="button" className="remove-set" onClick={() => setSetDrafts((sets) => sets.filter((item) => item.id !== set.id))} aria-label={t(`Remove set ${index + 1}`, `Видалити підхід ${index + 1}`)}><X size={16} /></button>
              </div>
            ))}
            {setDrafts.length === 0 && <p className="sets-empty">{t("No sets added. You can still save a session-only workout.", "Підходів немає. Тренування все одно можна зберегти.")}</p>}
          </div>
          <SaveActions saving={saving} onCancel={closeDialog} label={editing === "new" ? t("Add workout", "Додати тренування") : t("Save changes", "Зберегти зміни")} />
        </form>
      </ModuleDialog>
      {toast && <ModuleToast {...toast} onClose={() => setToast(null)} />}
    </>
  );
}
