"use client";

import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Copy,
  Dumbbell,
  Edit3,
  History,
  ListChecks,
  Play,
  Plus,
  Repeat2,
  Route,
  Trash2,
  Trophy,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useCallback, useEffect, useState } from "react";

import {
  DataNotice,
  EmptyState,
  ModuleDialog,
  ModuleHeader,
  ModuleState,
  ModuleToast,
  MonthPickerInput,
  SaveActions,
} from "@/components/module-ui";
import { useModuleData } from "@/hooks/use-module-data";
import { useLocale } from "@/lib/i18n";
import {
  asNumber,
  createRecord,
  deleteRecord,
  fetchTrainingData,
  type TrainingData,
  type Workout,
  type WorkoutRoutine,
  type WorkoutSet,
  updateRecord,
} from "@/lib/module-api";
import {
  expandRoutine,
  groupWorkoutSets,
  nextDraftKey,
  normalizeExercise,
  repeatWorkout,
  STARTER_ROUTINES,
  type RoutineExercise,
} from "@/lib/training";
import { getPeriod, TrackerApiError } from "@/lib/tracker-api";

type View = "overview" | "routines" | "history";
type Toast = { message: string; tone: "success" | "error" };
type SetDraft = {
  id: string;
  reps: string;
  weight: string;
  distance: string;
  duration: string;
  notes: string;
};
type ExerciseDraft = { id: string; name: string; sets: SetDraft[] };
type RoutineExerciseDraft = {
  id: string;
  name: string;
  setCount: string;
  targetReps: string;
  weight: string;
  restSeconds: string;
  notes: string;
};

const UK_EXERCISES: Record<string, string> = {
  "back squat": "Присідання зі штангою",
  "bench press": "Жим лежачи",
  "barbell row": "Тяга штанги в нахилі",
  "overhead press": "Жим над головою",
  "lat pulldown": "Тяга верхнього блока",
  "romanian deadlift": "Румунська тяга",
  "leg press": "Жим ногами",
  "calf raise": "Підйом на носки",
  "incline dumbbell press": "Жим гантелей під кутом",
  "triceps pushdown": "Розгинання рук на блоці",
  deadlift: "Станова тяга",
  "biceps curl": "Згинання рук на біцепс",
  "bulgarian split squat": "Болгарські присідання",
  "leg curl": "Згинання ніг",
};

function exerciseLabel(value: string, ukrainian: boolean): string {
  const normalized = normalizeExercise(value);
  if (ukrainian && UK_EXERCISES[normalized]) return UK_EXERCISES[normalized];
  return normalized.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function createSetDraft(set?: WorkoutSet): SetDraft {
  return {
    id: nextDraftKey(),
    reps: set?.reps == null ? "" : String(set.reps),
    weight: set?.weight_kg == null ? "" : String(set.weight_kg),
    distance: set?.distance_km == null ? "" : String(set.distance_km),
    duration: set?.duration_seconds == null ? "" : String(set.duration_seconds),
    notes: set?.notes ?? "",
  };
}

function createExerciseDraft(name = "", sets = [createSetDraft()]): ExerciseDraft {
  return { id: nextDraftKey(), name, sets };
}

function createRoutineExerciseDraft(
  item?: Partial<RoutineExercise> & { exercise?: string },
): RoutineExerciseDraft {
  return {
    id: nextDraftKey(),
    name: item?.exercise ?? "",
    setCount: String(item?.setCount ?? 3),
    targetReps: String(item?.targetReps ?? 8),
    weight: item?.targetWeightKg == null ? "" : String(item.targetWeightKg),
    restSeconds: String(item?.restSeconds ?? 90),
    notes: item?.notes ?? "",
  };
}

function workoutDrafts(workout: Workout): ExerciseDraft[] {
  return groupWorkoutSets(workout.sets).map((group) =>
    createExerciseDraft(group.exercise, group.sets.map(createSetDraft)),
  );
}

function routineDrafts(routine: WorkoutRoutine): RoutineExerciseDraft[] {
  return routine.exercises.map((item) => createRoutineExerciseDraft({
    exercise: item.exercise,
    setCount: item.set_count,
    targetReps: item.target_reps,
    targetWeightKg: item.target_weight_kg == null
      ? null
      : asNumber(item.target_weight_kg),
    restSeconds: item.rest_seconds,
    notes: item.notes,
  }));
}

function dateTimeLocal(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function formatWorkoutDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function formatDuration(minutes: number, ukrainian: boolean): string {
  if (minutes < 60) return `${minutes} ${ukrainian ? "хв" : "min"}`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest
    ? `${hours}${ukrainian ? "год" : "h"} ${rest}${ukrainian ? "хв" : "m"}`
    : `${hours}${ukrainian ? "год" : "h"}`;
}

function routineExercises(routine: WorkoutRoutine): RoutineExercise[] {
  return routine.exercises.map((item) => ({
    exercise: item.exercise,
    setCount: item.set_count,
    targetReps: item.target_reps,
    targetWeightKg: item.target_weight_kg == null
      ? null
      : asNumber(item.target_weight_kg),
    restSeconds: item.rest_seconds,
    notes: item.notes,
  }));
}

export default function TrainingPage({
  initialPeriodKey,
  latestPeriodKey,
}: {
  initialPeriodKey: string;
  latestPeriodKey: string;
}) {
  const { locale, intlLocale, t } = useLocale();
  const router = useRouter();
  const ukrainian = locale === "uk";
  const [view, setView] = useState<View>("overview");
  const [periodKey, setPeriodKey] = useState(initialPeriodKey);
  const { data, loading, stale, error, refresh } = useModuleData<TrainingData>(
    "training",
    periodKey,
    fetchTrainingData,
  );
  const [editing, setEditing] = useState<Workout | "new" | null>(null);
  const [exerciseDrafts, setExerciseDrafts] = useState<ExerciseDraft[]>([]);
  const [routineEditing, setRoutineEditing] = useState<WorkoutRoutine | "new" | null>(null);
  const [routineExerciseDrafts, setRoutineExerciseDrafts] = useState<RoutineExerciseDraft[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pendingStart, setPendingStart] = useState<Record<string, unknown> | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const period = getPeriod(periodKey, new Date(), intlLocale);
  const displayPeriod = getPeriod(data?.period.key ?? periodKey, new Date(), intlLocale);
  const closeWorkoutDialog = useCallback(() => setEditing(null), []);
  const closeRoutineDialog = useCallback(() => setRoutineEditing(null), []);
  const closeStartDialog = useCallback(() => setPendingStart(null), []);

  useEffect(() => {
    if (!focusKey) return;
    const frame = requestAnimationFrame(() => {
      document.querySelector<HTMLInputElement>(`[data-focus-key="${focusKey}"]`)?.focus();
      setFocusKey(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [exerciseDrafts, focusKey, routineExerciseDrafts]);

  const startPayload = useCallback(async (payload: Record<string, unknown>) => {
    if (data?.active) {
      setPendingStart(payload);
      return;
    }
    setSaving(true);
    try {
      await createRecord<Workout>("/workouts/active", payload);
      router.push("/training/session");
    } catch (reason) {
      if (reason instanceof TrackerApiError && reason.status === 409) {
        setPendingStart(payload);
        refresh();
      } else {
        setToast({
          message: reason instanceof Error
            ? reason.message
            : t("Could not start the workout.", "Не вдалося почати тренування."),
          tone: "error",
        });
      }
    } finally {
      setSaving(false);
    }
  }, [data?.active, refresh, router, t]);

  const startEmpty = () => void startPayload({
    name: t("Strength workout", "Силове тренування"),
    performed_at: new Date().toISOString(),
    duration_minutes: null,
    notes: null,
    sets: [],
  });

  const discardAndStart = async () => {
    if (!data?.active || !pendingStart) return;
    setSaving(true);
    try {
      await deleteRecord(`/workouts/${data.active.id}`);
      await createRecord<Workout>("/workouts/active", pendingStart);
      router.push("/training/session");
    } catch (reason) {
      setToast({
        message: reason instanceof Error
          ? reason.message
          : t("Could not replace the active workout.", "Не вдалося замінити активне тренування."),
        tone: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const repeat = (workout: Workout) => void startPayload(repeatWorkout(workout));

  const openNew = () => {
    const first = createExerciseDraft();
    setExerciseDrafts([first]);
    setEditing("new");
    setFocusKey(first.id);
  };

  const openEdit = (workout: Workout) => {
    setExerciseDrafts(workoutDrafts(workout));
    setEditing(workout);
  };

  const updateSet = (
    exerciseId: string,
    setId: string,
    field: keyof Omit<SetDraft, "id">,
    value: string,
  ) => setExerciseDrafts((exercises) => exercises.map((item) =>
    item.id !== exerciseId
      ? item
      : {
          ...item,
          sets: item.sets.map((set) => set.id === setId ? { ...set, [field]: value } : set),
        },
  ));

  const addPastExercise = () => {
    const next = createExerciseDraft();
    setExerciseDrafts((items) => [...items, next]);
    setFocusKey(next.id);
  };

  const duplicatePastExercise = (exercise: ExerciseDraft) => {
    const duplicate = createExerciseDraft(
      `${exercise.name} ${t("copy", "копія")}`.trim(),
      exercise.sets.map((set) => ({ ...set, id: nextDraftKey() })),
    );
    setExerciseDrafts((items) => [...items, duplicate]);
    setFocusKey(duplicate.id);
  };

  const addPastSet = (exerciseId: string) => setExerciseDrafts((items) => items.map((item) => {
    if (item.id !== exerciseId) return item;
    const previous = item.sets.at(-1);
    const next = previous ? { ...previous, id: nextDraftKey(), notes: "" } : createSetDraft();
    setFocusKey(next.id);
    return { ...item, sets: [...item.sets, next] };
  }));

  const saveWorkout = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = exerciseDrafts.map((item) => normalizeExercise(item.name));
    if (normalized.some((name) => !name) || new Set(normalized).size !== normalized.length) {
      setToast({
        message: t("Exercise names must be filled in and unique.", "Назви вправ мають бути заповнені й унікальні."),
        tone: "error",
      });
      return;
    }
    if (exerciseDrafts.some((item) => item.sets.length === 0 || item.sets.some(
      (set) => ![set.reps, set.weight, set.distance, set.duration].some(Boolean),
    ))) {
      setToast({
        message: t("Every set needs at least one metric.", "Кожен підхід має містити хоча б один показник."),
        tone: "error",
      });
      return;
    }
    const form = new FormData(event.currentTarget);
    let position = 0;
    const sets = exerciseDrafts.flatMap((exercise) => exercise.sets.map((set, index) => ({
      exercise: exercise.name.trim(),
      set_number: index + 1,
      position: ++position,
      is_completed: true,
      rest_seconds: null,
      reps: set.reps === "" ? null : Number(set.reps),
      weight_kg: set.weight === "" ? null : Number(set.weight),
      distance_km: set.distance === "" ? null : Number(set.distance),
      duration_seconds: set.duration === "" ? null : Number(set.duration),
      notes: set.notes.trim() || null,
    })));
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
      setToast({
        message: editing === "new"
          ? t("Workout added", "Тренування додано")
          : t("Workout updated", "Тренування оновлено"),
        tone: "success",
      });
      refresh();
    } catch (reason) {
      setToast({
        message: reason instanceof Error
          ? reason.message
          : t("Could not save the workout.", "Не вдалося зберегти тренування."),
        tone: "error",
      });
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
      setToast({
        message: reason instanceof Error
          ? reason.message
          : t("Could not delete the workout.", "Не вдалося видалити тренування."),
        tone: "error",
      });
    }
  };

  const openNewRoutine = () => {
    const first = createRoutineExerciseDraft();
    setRoutineExerciseDrafts([first]);
    setRoutineEditing("new");
    setFocusKey(first.id);
  };

  const openRoutine = (routine: WorkoutRoutine) => {
    setRoutineExerciseDrafts(routineDrafts(routine));
    setRoutineEditing(routine);
  };

  const copyRoutine = async (name: string, exercises: RoutineExercise[], notes: string | null = null) => {
    setSaving(true);
    try {
      await createRecord<WorkoutRoutine>("/workout-routines", {
        name: `${name} ${t("copy", "копія")}`,
        notes,
        exercises: exercises.map((item, index) => ({
          position: index + 1,
          exercise: item.exercise,
          set_count: item.setCount,
          target_reps: item.targetReps,
          target_weight_kg: item.targetWeightKg,
          rest_seconds: item.restSeconds,
          notes: item.notes,
        })),
      });
      setToast({ message: t("Routine copied", "Програму скопійовано"), tone: "success" });
      refresh();
    } catch (reason) {
      setToast({
        message: reason instanceof Error ? reason.message : t("Could not copy the routine.", "Не вдалося скопіювати програму."),
        tone: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const saveRoutine = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const names = routineExerciseDrafts.map((item) => normalizeExercise(item.name));
    if (names.some((name) => !name) || new Set(names).size !== names.length) {
      setToast({
        message: t("Exercise names must be filled in and unique.", "Назви вправ мають бути заповнені й унікальні."),
        tone: "error",
      });
      return;
    }
    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get("name")).trim(),
      notes: String(form.get("notes") ?? "").trim() || null,
      exercises: routineExerciseDrafts.map((item, index) => ({
        position: index + 1,
        exercise: item.name.trim(),
        set_count: Number(item.setCount),
        target_reps: Number(item.targetReps),
        target_weight_kg: item.weight === "" ? null : Number(item.weight),
        rest_seconds: Number(item.restSeconds),
        notes: item.notes.trim() || null,
      })),
    };
    setSaving(true);
    try {
      if (routineEditing === "new") {
        await createRecord<WorkoutRoutine>("/workout-routines", payload);
      } else if (routineEditing) {
        await updateRecord<WorkoutRoutine>(`/workout-routines/${routineEditing.id}`, payload);
      }
      setRoutineEditing(null);
      setToast({ message: t("Routine saved", "Програму збережено"), tone: "success" });
      refresh();
    } catch (reason) {
      setToast({
        message: reason instanceof Error ? reason.message : t("Could not save the routine.", "Не вдалося зберегти програму."),
        tone: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const removeRoutine = async (routine: WorkoutRoutine) => {
    if (!window.confirm(t(`Delete “${routine.name}”?`, `Видалити «${routine.name}»?`))) return;
    try {
      await deleteRecord(`/workout-routines/${routine.id}`);
      setToast({ message: t("Routine deleted", "Програму видалено"), tone: "success" });
      refresh();
    } catch (reason) {
      setToast({
        message: reason instanceof Error ? reason.message : t("Could not delete the routine.", "Не вдалося видалити програму."),
        tone: "error",
      });
    }
  };

  const moveRoutineExercise = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= routineExerciseDrafts.length) return;
    setRoutineExerciseDrafts((items) => {
      const next = [...items];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const summary = data?.summary;
  const average = summary?.average_duration_minutes == null
    ? null
    : asNumber(summary.average_duration_minutes);
  const recent = data?.recentWorkouts.slice(0, 4) ?? [];
  const latest = data?.recentWorkouts[0];
  const tabs = [
    { id: "overview" as const, label: t("Overview", "Огляд"), icon: Trophy },
    { id: "routines" as const, label: t("Routines", "Програми"), icon: ListChecks },
    { id: "history" as const, label: t("History", "Історія"), icon: History },
  ];

  return (
    <>
      <ModuleHeader
        eyebrow={t("Training", "Тренування")}
        title={t("Build strength, set by set.", "Ставайте сильнішими — підхід за підходом.")}
        description={t(
          "Start from a routine, track the work live, and keep every session easy to repeat.",
          "Починайте з програми, фіксуйте роботу наживо й легко повторюйте кожне тренування.",
        )}
        onAdd={data?.active ? () => router.push("/training/session") : startEmpty}
        addLabel={data?.active ? t("Resume workout", "Продовжити") : t("Start workout", "Почати тренування")}
      />
      <div className="module-tabs training-tabs" role="tablist" aria-label={t("Training views", "Розділи тренувань")}>
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            id={`training-tab-${id}`}
            role="tab"
            aria-selected={view === id}
            aria-controls={`training-panel-${id}`}
            tabIndex={view === id ? 0 : -1}
            className={view === id ? "active" : ""}
            onClick={() => setView(id)}
            onKeyDown={(event) => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
              event.preventDefault();
              const direction = event.key === "ArrowRight" ? 1 : -1;
              const nextIndex = (tabs.findIndex((tab) => tab.id === id) + direction + tabs.length) % tabs.length;
              setView(tabs[nextIndex].id);
              event.currentTarget.parentElement
                ?.querySelectorAll<HTMLButtonElement>("[role='tab']")[nextIndex]
                ?.focus();
            }}
          >
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>
      {data && <DataNotice loading={loading} error={error} onRetry={refresh} />}
      {!data ? <ModuleState error={error} onRetry={refresh} /> : (
        <div className={`refresh-surface training-workspace ${loading || stale ? "is-refreshing" : ""}`} aria-busy={loading}>
          {view === "overview" && <div role="tabpanel" id="training-panel-overview" aria-labelledby="training-tab-overview">
            <section className={`active-workout-card ${data.active ? "active" : ""}`}>
              <div className="active-workout-copy">
                <span className="stat-icon lime"><Dumbbell size={20} /></span>
                <div>
                  <p className="eyebrow">{data.active ? t("In progress", "Триває") : t("Next session", "Наступне тренування")}</p>
                  <h2>{data.active?.name ?? t("Ready when you are", "Починайте, коли готові")}</h2>
                  <p>{data.active
                    ? `${data.active.sets.filter((set) => set.is_completed).length}/${data.active.sets.length} ${t("sets complete", "підходів виконано")}`
                    : t("Choose a starter or begin with an empty workout.", "Оберіть готову програму або почніть порожнє тренування.")}</p>
                </div>
              </div>
              <button className="submit-button" onClick={data.active ? () => router.push("/training/session") : startEmpty}>
                <Play size={18} /> {data.active ? t("Resume", "Продовжити") : t("Start workout", "Почати тренування")}
              </button>
            </section>

            <section className="module-stats module-stats-four" aria-label={t("Monthly strength summary", "Місячний підсумок сили")}>
              <article className="module-stat"><span className="stat-icon forest"><Dumbbell size={18} /></span><p>{t("Sessions", "Тренування")}</p><strong>{summary?.workout_count ?? 0}</strong><em>{summary?.total_sets ?? 0} {t("completed sets", "виконаних підходів")}</em></article>
              <article className="module-stat"><span className="stat-icon lime"><Clock3 size={18} /></span><p>{t("Training time", "Час тренувань")}</p><strong>{formatDuration(summary?.total_duration_minutes ?? 0, ukrainian)}</strong><em>{average == null ? t("No average yet", "Середнього ще немає") : `${Math.round(average)} ${t("min average", "хв у середньому")}`}</em></article>
              <article className="module-stat"><span className="stat-icon amber"><Trophy size={18} /></span><p>{t("Volume", "Обсяг")}</p><strong>{Math.round(asNumber(summary?.total_volume_kg)).toLocaleString(intlLocale)} <small>{t("kg", "кг")}</small></strong><em>{summary?.total_reps ?? 0} {t("total reps", "повторів")}</em></article>
              <article className="module-stat"><span className="stat-icon blue"><Route size={18} /></span><p>{t("Distance", "Відстань")}</p><strong>{asNumber(summary?.total_distance_km).toFixed(1)} <small>{t("km", "км")}</small></strong><em>{displayPeriod.label}</em></article>
            </section>

            <div className="module-two-column training-layout">
              <section className="module-section">
                <div className="section-heading"><div><p className="eyebrow">{t("Start strong", "Почніть із сили")}</p><h2>{t("Suggested routines", "Рекомендовані програми")}</h2></div><button className="text-action" onClick={() => setView("routines")}>{t("View all", "Переглянути всі")} <ChevronRight size={15} /></button></div>
                <div className="routine-suggestions">
                  {STARTER_ROUTINES.slice(0, 3).map((routine) => (
                    <button key={routine.id} onClick={() => void startPayload(expandRoutine(routine.name, routine.exercises))}>
                      <span><strong>{ukrainian ? routine.ukName : routine.name}</strong><small>{routine.exercises.length} {t("exercises", "вправ")}</small></span>
                      <Play size={17} />
                    </button>
                  ))}
                </div>
              </section>
              <section className="module-section">
                <div className="section-heading"><div><p className="eyebrow">{t("Recent work", "Остання робота")}</p><h2>{t("Recent workouts", "Останні тренування")}</h2></div>{latest && <button className="text-action" onClick={() => repeat(latest)}><Repeat2 size={14} /> {t("Repeat last", "Повторити останнє")}</button>}</div>
                {recent.length ? <div className="compact-workout-list">{recent.map((workout) => (
                  <button key={workout.id} onClick={() => { setView("history"); setPeriodKey(workout.performed_at.slice(0, 7)); setExpanded(new Set([workout.id])); }}>
                    <span><strong>{workout.name}</strong><small>{formatWorkoutDate(workout.performed_at, intlLocale)}</small></span>
                    <span>{workout.sets.length} {t("sets", "підх.")}</span>
                  </button>
                ))}</div> : <EmptyState icon={<Dumbbell size={22} />} title={t("No workouts yet", "Тренувань ще немає")} description={t("Your finished sessions will appear here.", "Тут з’являться завершені тренування.")} />}
              </section>
            </div>
          </div>}

          {view === "routines" && <section className="module-section routine-workspace" role="tabpanel" id="training-panel-routines" aria-labelledby="training-tab-routines">
            <div className="section-heading"><div><p className="eyebrow">{t("Programs", "Програми")}</p><h2>{t("Starter and custom routines", "Готові та власні програми")}</h2><p className="section-caption">{t("Built-ins stay unchanged. Save a copy to tailor one.", "Готові програми не змінюються. Збережіть копію, щоб налаштувати її.")}</p></div><button className="secondary-button" onClick={openNewRoutine}><Plus size={16} /> {t("New routine", "Нова програма")}</button></div>
            <div className="routine-grid">
              {STARTER_ROUTINES.map((routine) => (
                <article className="routine-card" key={routine.id}>
                  <div><span className="routine-kind">{t("Starter", "Готова")}</span><h3>{ukrainian ? routine.ukName : routine.name}</h3><p>{routine.exercises.map((item) => `${exerciseLabel(item.exercise, ukrainian)} ${item.setCount}×${item.targetReps}`).join(" · ")}</p></div>
                  <div className="routine-actions"><button className="submit-button" onClick={() => void startPayload(expandRoutine(routine.name, routine.exercises))}><Play size={15} /> {t("Start", "Почати")}</button><button className="secondary-button" onClick={() => void copyRoutine(routine.name, routine.exercises)}><Copy size={15} /> {t("Save a copy", "Зберегти копію")}</button></div>
                </article>
              ))}
              {data.routines.map((routine) => (
                <article className="routine-card custom" key={routine.id}>
                  <div><span className="routine-kind">{t("Custom", "Власна")}</span><h3>{routine.name}</h3><p>{routine.exercises.map((item) => `${exerciseLabel(item.exercise, ukrainian)} ${item.set_count}×${item.target_reps}`).join(" · ")}</p></div>
                  <div className="routine-actions"><button className="submit-button" onClick={() => void startPayload(expandRoutine(routine.name, routineExercises(routine)))}><Play size={15} /> {t("Start", "Почати")}</button><button className="secondary-button icon-only" onClick={() => void copyRoutine(routine.name, routineExercises(routine), routine.notes)} aria-label={t(`Copy ${routine.name}`, `Копіювати ${routine.name}`)}><Copy size={15} /></button><button className="secondary-button icon-only" onClick={() => openRoutine(routine)} aria-label={t(`Edit ${routine.name}`, `Редагувати ${routine.name}`)}><Edit3 size={15} /></button><button className="secondary-button icon-only danger" onClick={() => void removeRoutine(routine)} aria-label={t(`Delete ${routine.name}`, `Видалити ${routine.name}`)}><Trash2 size={15} /></button></div>
                </article>
              ))}
            </div>
          </section>}

          {view === "history" && <div role="tabpanel" id="training-panel-history" aria-labelledby="training-tab-history">
            <div className="history-toolbar">
              <div><p className="eyebrow">{t("Workout history", "Історія тренувань")}</p><h2>{displayPeriod.label}</h2></div>
              <MonthPickerInput value={periodKey} max={latestPeriodKey} onChange={setPeriodKey} />
            </div>
            <section className="module-stats module-stats-four history-stats" aria-label={t("History summary", "Підсумок історії")}>
              <article className="module-stat"><p>{t("Sessions", "Тренування")}</p><strong>{summary?.workout_count ?? 0}</strong></article>
              <article className="module-stat"><p>{t("Sets", "Підходи")}</p><strong>{summary?.total_sets ?? 0}</strong></article>
              <article className="module-stat"><p>{t("Volume", "Обсяг")}</p><strong>{Math.round(asNumber(summary?.total_volume_kg)).toLocaleString(intlLocale)} <small>{t("kg", "кг")}</small></strong></article>
              <article className="module-stat"><p>{t("Duration", "Тривалість")}</p><strong>{formatDuration(summary?.total_duration_minutes ?? 0, ukrainian)}</strong></article>
            </section>
            <section className="module-section history-section">
              <div className="section-heading"><div><p className="eyebrow">{t("Completed sessions", "Завершені тренування")}</p><h2>{t("Workouts", "Тренування")}</h2></div><button className="secondary-button" onClick={openNew}><Plus size={16} /> {t("Add past workout", "Додати минуле тренування")}</button></div>
              {data.workouts.length ? <div className="history-list">{data.workouts.map((workout) => {
                const isOpen = expanded.has(workout.id);
                const groups = groupWorkoutSets(workout.sets);
                return <article className="history-card" key={workout.id}>
                  <div className="history-card-header">
                    <button className="history-expand" aria-expanded={isOpen} onClick={() => setExpanded((items) => {
                      const next = new Set(items);
                      if (next.has(workout.id)) next.delete(workout.id); else next.add(workout.id);
                      return next;
                    })}>
                      <span className="workout-symbol"><Dumbbell size={19} /></span>
                      <span><strong>{workout.name}</strong><small>{formatWorkoutDate(workout.performed_at, intlLocale)}{workout.duration_minutes ? ` · ${formatDuration(workout.duration_minutes, ukrainian)}` : ""} · {workout.sets.length} {t("sets", "підходів")}</small></span>
                      {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    </button>
                    <div className="record-actions"><button onClick={() => repeat(workout)} aria-label={t(`Repeat ${workout.name}`, `Повторити ${workout.name}`)}><Repeat2 size={16} /></button><button onClick={() => openEdit(workout)} aria-label={t(`Edit ${workout.name}`, `Редагувати ${workout.name}`)}><Edit3 size={16} /></button><button className="danger" onClick={() => void removeWorkout(workout)} aria-label={t(`Delete ${workout.name}`, `Видалити ${workout.name}`)}><Trash2 size={16} /></button></div>
                  </div>
                  {isOpen && <div className="history-details">{groups.map((group) => <div className="history-exercise" key={normalizeExercise(group.exercise)}><h3>{exerciseLabel(group.exercise, ukrainian)}</h3>{group.sets.map((set) => <div className="history-set" key={set.id}><strong>{set.set_number}</strong><span>{set.weight_kg != null ? `${asNumber(set.weight_kg)} ${t("kg", "кг")}` : "—"}</span><span>{set.reps != null ? `${set.reps} ${t("reps", "повт.")}` : "—"}</span>{set.distance_km != null && <span>{asNumber(set.distance_km)} {t("km", "км")}</span>}{set.duration_seconds != null && <span>{set.duration_seconds} {t("sec", "с")}</span>}{set.notes && <em>{set.notes}</em>}</div>)}</div>)}{workout.notes && <p className="workout-note">{workout.notes}</p>}</div>}
                </article>;
              })}</div> : <EmptyState icon={<History size={22} />} title={t("No workouts this month", "Цього місяця тренувань немає")} description={t("Completed workouts will be grouped here with every set.", "Завершені тренування з усіма підходами з’являться тут.")} action={t("Add past workout", "Додати минуле тренування")} onAction={openNew} />}
            </section>
          </div>}
        </div>
      )}

      <ModuleDialog open={editing !== null} title={editing === "new" ? t("Add a past workout", "Додати минуле тренування") : t("Edit workout", "Редагувати тренування")} eyebrow={t("History", "Історія")} saving={saving} onClose={closeWorkoutDialog}>
        <form className="log-form workout-form grouped-workout-form" onSubmit={saveWorkout} key={editing === "new" ? "new" : editing?.id}>
          <label><span>{t("Session name", "Назва тренування")}</span><input name="name" maxLength={200} defaultValue={editing === "new" ? "" : editing?.name} placeholder={t("Lower body strength", "Силове тренування ніг")} required /></label>
          <div className="form-grid"><label><span>{t("Date and time", "Дата й час")}</span><input name="performed_at" type="datetime-local" min={`${period.startDate}T00:00`} max={`${period.endDate}T23:59`} defaultValue={editing === "new" ? `${period.referenceDate}T18:00` : dateTimeLocal(editing?.performed_at ?? "")} required /></label><label><span>{t("Duration", "Тривалість")}</span><div className="input-unit"><input name="duration_minutes" type="number" min="1" defaultValue={editing === "new" ? "" : editing?.duration_minutes ?? ""} placeholder="60" /><em>{t("min", "хв")}</em></div></label></div>
          <label><span>{t("Session notes", "Нотатки про тренування")}</span><textarea name="notes" rows={2} defaultValue={editing === "new" ? "" : editing?.notes ?? ""} /></label>
          <div className="sets-heading"><div><span>{t("Exercise sets", "Вправи та підходи")}</span><small>{t("Weight and reps are primary; distance and time stay available.", "Вага й повтори — основні; відстань і час також доступні.")}</small></div><button type="button" className="secondary-button" onClick={addPastExercise}><Plus size={15} /> {t("Add exercise", "Додати вправу")}</button></div>
          <div className="exercise-editor-list">{exerciseDrafts.map((exercise, exerciseIndex) => <section className="exercise-editor-card" key={exercise.id}>
            <div className="exercise-editor-heading"><label><span>{t("Exercise", "Вправа")} {exerciseIndex + 1}</span><input data-focus-key={exercise.id} value={exercise.name} onChange={(event) => setExerciseDrafts((items) => items.map((item) => item.id === exercise.id ? { ...item, name: event.target.value } : item))} placeholder={t("Back Squat", "Присідання зі штангою")} required /></label><div><button type="button" onClick={() => duplicatePastExercise(exercise)} aria-label={t("Duplicate exercise", "Дублювати вправу")}><Copy size={16} /></button><button type="button" className="danger" onClick={() => setExerciseDrafts((items) => items.filter((item) => item.id !== exercise.id))} aria-label={t("Remove exercise", "Видалити вправу")}><Trash2 size={16} /></button></div></div>
            <div className="grouped-set-list">{exercise.sets.map((set, setIndex) => <div className="grouped-set-row" key={set.id}><span className="set-number">{setIndex + 1}</span><label><span>{t("kg", "кг")}</span><input data-focus-key={set.id} type="number" min="0" step="0.001" value={set.weight} onChange={(event) => updateSet(exercise.id, set.id, "weight", event.target.value)} inputMode="decimal" /></label><label><span>{t("Reps", "Повтори")}</span><input type="number" min="0" value={set.reps} onChange={(event) => updateSet(exercise.id, set.id, "reps", event.target.value)} inputMode="numeric" /></label><details><summary>{t("More", "Ще")}</summary><div><label><span>{t("km", "км")}</span><input type="number" min="0" step="0.001" value={set.distance} onChange={(event) => updateSet(exercise.id, set.id, "distance", event.target.value)} /></label><label><span>{t("Seconds", "Секунди")}</span><input type="number" min="0" value={set.duration} onChange={(event) => updateSet(exercise.id, set.id, "duration", event.target.value)} /></label><label><span>{t("Set note", "Нотатка")}</span><input value={set.notes} onChange={(event) => updateSet(exercise.id, set.id, "notes", event.target.value)} /></label></div></details><button type="button" className="remove-set" onClick={() => setExerciseDrafts((items) => items.map((item) => item.id === exercise.id ? { ...item, sets: item.sets.filter((candidate) => candidate.id !== set.id) } : item))} aria-label={t(`Remove set ${setIndex + 1}`, `Видалити підхід ${setIndex + 1}`)}><X size={16} /></button></div>)}</div>
            <button type="button" className="add-set-button" onClick={() => addPastSet(exercise.id)}><Plus size={15} /> {t("Add set", "Додати підхід")}</button>
          </section>)}</div>
          <SaveActions saving={saving} onCancel={closeWorkoutDialog} label={editing === "new" ? t("Add workout", "Додати тренування") : t("Save changes", "Зберегти зміни")} />
        </form>
      </ModuleDialog>

      <ModuleDialog open={routineEditing !== null} title={routineEditing === "new" ? t("New routine", "Нова програма") : t("Edit routine", "Редагувати програму")} eyebrow={t("Routines", "Програми")} saving={saving} onClose={closeRoutineDialog}>
        <form className="log-form routine-form" onSubmit={saveRoutine} key={routineEditing === "new" ? "new" : routineEditing?.id}>
          <label><span>{t("Routine name", "Назва програми")}</span><input name="name" maxLength={200} defaultValue={routineEditing === "new" ? "" : routineEditing?.name} required /></label>
          <label><span>{t("Notes", "Примітки")}</span><textarea name="notes" rows={2} defaultValue={routineEditing === "new" ? "" : routineEditing?.notes ?? ""} /></label>
          <div className="routine-exercise-editor">{routineExerciseDrafts.map((item, index) => <div className="routine-exercise-row" key={item.id}>
            <label className="routine-exercise-name"><span>{t("Exercise", "Вправа")}</span><input data-focus-key={item.id} value={item.name} onChange={(event) => setRoutineExerciseDrafts((items) => items.map((candidate) => candidate.id === item.id ? { ...candidate, name: event.target.value } : candidate))} required /></label>
            <label><span>{t("Sets", "Підходи")}</span><input type="number" min="1" max="20" value={item.setCount} onChange={(event) => setRoutineExerciseDrafts((items) => items.map((candidate) => candidate.id === item.id ? { ...candidate, setCount: event.target.value } : candidate))} required /></label>
            <label><span>{t("Reps", "Повтори")}</span><input type="number" min="1" value={item.targetReps} onChange={(event) => setRoutineExerciseDrafts((items) => items.map((candidate) => candidate.id === item.id ? { ...candidate, targetReps: event.target.value } : candidate))} required /></label>
            <label><span>{t("kg target", "ціль, кг")}</span><input type="number" min="0" step="0.001" value={item.weight} onChange={(event) => setRoutineExerciseDrafts((items) => items.map((candidate) => candidate.id === item.id ? { ...candidate, weight: event.target.value } : candidate))} /></label>
            <label><span>{t("Rest sec", "Відпоч., с")}</span><input type="number" min="0" max="3600" value={item.restSeconds} onChange={(event) => setRoutineExerciseDrafts((items) => items.map((candidate) => candidate.id === item.id ? { ...candidate, restSeconds: event.target.value } : candidate))} required /></label>
            <div className="routine-row-actions"><button type="button" disabled={index === 0} onClick={() => moveRoutineExercise(index, -1)} aria-label={t("Move exercise up", "Перемістити вправу вгору")}><ArrowUp size={15} /></button><button type="button" disabled={index === routineExerciseDrafts.length - 1} onClick={() => moveRoutineExercise(index, 1)} aria-label={t("Move exercise down", "Перемістити вправу вниз")}><ArrowDown size={15} /></button><button type="button" className="danger" onClick={() => setRoutineExerciseDrafts((items) => items.filter((candidate) => candidate.id !== item.id))} aria-label={t("Remove exercise", "Видалити вправу")}><Trash2 size={15} /></button></div>
            <label className="routine-exercise-notes"><span>{t("Exercise notes", "Нотатки до вправи")}</span><input value={item.notes} onChange={(event) => setRoutineExerciseDrafts((items) => items.map((candidate) => candidate.id === item.id ? { ...candidate, notes: event.target.value } : candidate))} /></label>
          </div>)}</div>
          <button type="button" className="add-set-button" onClick={() => { const next = createRoutineExerciseDraft(); setRoutineExerciseDrafts((items) => [...items, next]); setFocusKey(next.id); }}><Plus size={15} /> {t("Add exercise", "Додати вправу")}</button>
          <SaveActions saving={saving} onCancel={closeRoutineDialog} label={t("Save routine", "Зберегти програму")} />
        </form>
      </ModuleDialog>

      <ModuleDialog open={pendingStart !== null} title={t("Workout already in progress", "Тренування вже триває")} eyebrow={t("Active session", "Активне тренування")} saving={saving} onClose={closeStartDialog}>
        <div className="resume-choice"><CheckCircle2 size={28} /><p>{t("Resume your current workout, or discard it and start the one you selected.", "Продовжіть поточне тренування або відкиньте його й почніть вибране.")}</p><div className="dialog-actions"><button className="secondary-button" onClick={closeStartDialog}>{t("Cancel", "Скасувати")}</button><button className="secondary-button danger" onClick={() => void discardAndStart()}>{t("Discard & start", "Відкинути й почати")}</button><button className="submit-button" onClick={() => router.push("/training/session")}>{t("Resume", "Продовжити")}</button></div></div>
      </ModuleDialog>
      {toast && <ModuleToast {...toast} onClose={() => setToast(null)} />}
    </>
  );
}
