"use client";

import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  Dumbbell,
  Plus,
  RotateCcw,
  TimerReset,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { EmptyState, ModuleDialog, ModuleToast } from "@/components/module-ui";
import { useLocale } from "@/lib/i18n";
import {
  completeWorkout,
  deleteRecord,
  fetchActiveWorkout,
  fetchRecentWorkouts,
  type Workout,
  updateRecord,
} from "@/lib/module-api";
import {
  groupWorkoutSets,
  nextDraftKey,
  normalizeExercise,
} from "@/lib/training";

type SessionSet = {
  key: string;
  exercise: string;
  set_number: number;
  position: number;
  reps: string;
  weight: string;
  distance: string;
  duration: string;
  notes: string;
  is_completed: boolean;
  rest_seconds: string;
};

type SessionDraft = {
  id: string;
  name: string;
  performed_at: string;
  notes: string;
  rest_timer_ends_at: string | null;
  sets: SessionSet[];
};

type SyncState = "saved" | "saving" | "error";
type Toast = { message: string; tone: "success" | "error" };

function sessionDraft(workout: Workout): SessionDraft {
  return {
    id: workout.id,
    name: workout.name,
    performed_at: workout.performed_at,
    notes: workout.notes ?? "",
    rest_timer_ends_at: workout.rest_timer_ends_at,
    sets: workout.sets.map((set, index) => ({
      key: nextDraftKey(),
      exercise: set.exercise,
      set_number: set.set_number,
      position: index + 1,
      reps: set.reps == null ? "" : String(set.reps),
      weight: set.weight_kg == null ? "" : String(set.weight_kg),
      distance: set.distance_km == null ? "" : String(set.distance_km),
      duration: set.duration_seconds == null ? "" : String(set.duration_seconds),
      notes: set.notes ?? "",
      is_completed: set.is_completed,
      rest_seconds: String(set.rest_seconds ?? 90),
    })),
  };
}

function payload(draft: SessionDraft) {
  const counts = new Map<string, number>();
  return {
    name: draft.name.trim(),
    performed_at: draft.performed_at,
    notes: draft.notes.trim() || null,
    rest_timer_ends_at: draft.rest_timer_ends_at,
    sets: draft.sets.map((set, index) => {
      const exercise = set.exercise.trim();
      const key = normalizeExercise(exercise);
      const setNumber = (counts.get(key) ?? 0) + 1;
      counts.set(key, setNumber);
      return {
        exercise,
        set_number: setNumber,
        position: index + 1,
        reps: set.reps === "" ? null : Number(set.reps),
        weight_kg: set.weight === "" ? null : Number(set.weight),
        distance_km: set.distance === "" ? null : Number(set.distance),
        duration_seconds: set.duration === "" ? null : Number(set.duration),
        notes: set.notes.trim() || null,
        is_completed: set.is_completed,
        rest_seconds: set.rest_seconds === "" ? null : Number(set.rest_seconds),
      };
    }),
  };
}

function elapsedLabel(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

function countdownLabel(totalSeconds: number): string {
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

export default function TrainingSessionPage() {
  const { intlLocale, t } = useLocale();
  const router = useRouter();
  const [draft, setDraft] = useState<SessionDraft | null>(null);
  const draftRef = useRef<SessionDraft | null>(null);
  const [recent, setRecent] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<SyncState>("saved");
  const [syncError, setSyncError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [finishOpen, setFinishOpen] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const saveChain = useRef<Promise<void>>(Promise.resolve());
  const lastQueued = useRef("");
  const initialized = useRef(false);
  const closeFinish = useCallback(() => setFinishOpen(false), []);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setLoadError(null);
    try {
      const [active, workouts] = await Promise.all([
        fetchActiveWorkout(signal),
        fetchRecentWorkouts(signal),
      ]);
      if (signal?.aborted) return;
      const next = active ? sessionDraft(active) : null;
      draftRef.current = next;
      setDraft(next);
      setRecent(workouts);
      initialized.current = false;
      setDirty(false);
      setSyncState("saved");
    } catch (reason) {
      if (signal?.aborted) return;
      setLoadError(reason instanceof Error ? reason.message : t("Could not load the workout.", "Не вдалося завантажити тренування."));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => void load(controller.signal));
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!focusKey) return;
    const frame = requestAnimationFrame(() => {
      document.querySelector<HTMLInputElement>(`[data-session-focus="${focusKey}"]`)?.focus();
      setFocusKey(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [draft, focusKey]);

  const queueSave = useCallback((snapshot: SessionDraft): Promise<void> => {
    const body = payload(snapshot);
    if (!body.name || body.sets.some((set) => !set.exercise)) {
      setDirty(true);
      setSyncState("error");
      const message = t(
        "Workout and exercise names cannot be blank.",
        "Назви тренування та вправ не можуть бути порожніми.",
      );
      setSyncError(message);
      return Promise.reject(new Error(message));
    }
    const serialized = JSON.stringify(body);
    if (serialized === lastQueued.current) return saveChain.current;
    lastQueued.current = serialized;
    setSyncState("saving");
    setSyncError(null);
    const request = saveChain.current.then(async () => {
      await updateRecord<Workout>(`/workouts/${snapshot.id}`, body);
      if (draftRef.current && JSON.stringify(payload(draftRef.current)) === serialized) {
        setDirty(false);
        setSyncState("saved");
      }
    }).catch((reason: unknown) => {
      if (lastQueued.current === serialized) lastQueued.current = "";
      setDirty(true);
      setSyncState("error");
      setSyncError(reason instanceof Error ? reason.message : t("Autosave failed.", "Автозбереження не вдалося."));
      throw reason;
    });
    saveChain.current = request.catch(() => undefined);
    return request;
  }, [t]);

  const changeDraft = useCallback((
    update: (current: SessionDraft) => SessionDraft,
    immediate = false,
  ) => {
    setDraft((current) => {
      if (!current) return current;
      const next = update(current);
      draftRef.current = next;
      setDirty(true);
      if (immediate) void queueSave(next).catch(() => undefined);
      return next;
    });
  }, [queueSave]);

  useEffect(() => {
    if (!draft) return;
    if (!initialized.current) {
      initialized.current = true;
      return;
    }
    const timer = window.setTimeout(() => {
      void queueSave(draft).catch(() => undefined);
    }, 750);
    return () => window.clearTimeout(timer);
  }, [draft, queueSave]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const updateSet = (setKey: string, field: keyof SessionSet, value: string | boolean) => {
    changeDraft((current) => ({
      ...current,
      sets: current.sets.map((set) => set.key === setKey ? { ...set, [field]: value } : set),
    }));
  };

  const completeSet = (setKey: string) => {
    const current = draftRef.current?.sets.find((set) => set.key === setKey);
    if (!current) return;
    if (!current.is_completed && ![current.reps, current.weight, current.distance, current.duration].some(Boolean)) {
      setToast({ message: t("Add a result before completing this set.", "Додайте результат перед завершенням підходу."), tone: "error" });
      return;
    }
    changeDraft((workout) => {
      const isCompleted = !current.is_completed;
      const restSeconds = Number(current.rest_seconds || 0);
      return {
        ...workout,
        rest_timer_ends_at: isCompleted && restSeconds > 0
          ? new Date(Date.now() + restSeconds * 1000).toISOString()
          : workout.rest_timer_ends_at,
        sets: workout.sets.map((set) => set.key === setKey ? { ...set, is_completed: isCompleted } : set),
      };
    }, true);
  };

  const addSet = (exerciseName: string) => changeDraft((current) => {
    const indexes = current.sets
      .map((set, index) => normalizeExercise(set.exercise) === normalizeExercise(exerciseName) ? index : -1)
      .filter((index) => index >= 0);
    const insertAt = (indexes.at(-1) ?? current.sets.length - 1) + 1;
    const previous = current.sets[insertAt - 1];
    const next: SessionSet = {
      ...previous,
      key: nextDraftKey(),
      exercise: exerciseName,
      set_number: indexes.length + 1,
      position: insertAt + 1,
      is_completed: false,
      notes: "",
    };
    const sets = [...current.sets];
    sets.splice(insertAt, 0, next);
    setFocusKey(next.key);
    return { ...current, sets: sets.map((set, index) => ({ ...set, position: index + 1 })) };
  });

  const addExercise = () => {
    const name = window.prompt(t("Exercise name", "Назва вправи"))?.trim();
    if (!name) return;
    if (draftRef.current?.sets.some((set) => normalizeExercise(set.exercise) === normalizeExercise(name))) {
      setToast({ message: t("That exercise is already in this workout.", "Ця вправа вже є у тренуванні."), tone: "error" });
      return;
    }
    const next: SessionSet = {
      key: nextDraftKey(),
      exercise: name,
      set_number: 1,
      position: (draftRef.current?.sets.length ?? 0) + 1,
      reps: "",
      weight: "",
      distance: "",
      duration: "",
      notes: "",
      is_completed: false,
      rest_seconds: "90",
    };
    changeDraft((current) => ({ ...current, sets: [...current.sets, next] }));
    setFocusKey(next.key);
  };

  const duplicateExercise = (exerciseName: string) => changeDraft((current) => {
    const source = current.sets.filter((set) => normalizeExercise(set.exercise) === normalizeExercise(exerciseName));
    const name = `${exerciseName} ${t("copy", "копія")}`;
    const copies = source.map((set, index) => ({
      ...set,
      key: nextDraftKey(),
      exercise: name,
      set_number: index + 1,
      position: current.sets.length + index + 1,
      is_completed: false,
      notes: "",
    }));
    setFocusKey(copies[0]?.key ?? null);
    return { ...current, sets: [...current.sets, ...copies] };
  });

  const removeExercise = (exerciseName: string) => changeDraft((current) => ({
    ...current,
    sets: current.sets
      .filter((set) => normalizeExercise(set.exercise) !== normalizeExercise(exerciseName))
      .map((set, index) => ({ ...set, position: index + 1 })),
  }));

  const adjustRest = (seconds: number | null) => changeDraft((current) => ({
    ...current,
    rest_timer_ends_at: seconds == null
      ? null
      : new Date(Math.max(Date.now(), new Date(current.rest_timer_ends_at ?? 0).getTime()) + seconds * 1000).toISOString(),
  }), true);

  const goBack = async () => {
    if (draftRef.current && dirty) {
      try {
        await queueSave(draftRef.current);
      } catch {
        return;
      }
    }
    router.push("/training");
  };

  const finish = async () => {
    const current = draftRef.current;
    if (!current) return;
    const completedCount = current.sets.filter((set) => set.is_completed).length;
    if (completedCount === 0 && !window.confirm(t(
      "Finish without any completed sets? The empty session will still be saved.",
      "Завершити без виконаних підходів? Порожнє тренування все одно буде збережено.",
    ))) return;
    setFinishing(true);
    try {
      await queueSave(current);
      await completeWorkout(current.id);
      setDirty(false);
      setFinishOpen(false);
      router.push("/training");
    } catch (reason) {
      setToast({ message: reason instanceof Error ? reason.message : t("Could not finish the workout.", "Не вдалося завершити тренування."), tone: "error" });
    } finally {
      setFinishing(false);
    }
  };

  const discard = async () => {
    const current = draftRef.current;
    if (!current || !window.confirm(t("Discard this workout?", "Відкинути це тренування?"))) return;
    setFinishing(true);
    try {
      await deleteRecord(`/workouts/${current.id}`);
      setDirty(false);
      router.push("/training");
    } catch (reason) {
      setToast({ message: reason instanceof Error ? reason.message : t("Could not discard the workout.", "Не вдалося відкинути тренування."), tone: "error" });
    } finally {
      setFinishing(false);
    }
  };

  const previous = useMemo(() => {
    const values = new Map<string, string>();
    recent.forEach((workout) => workout.sets.forEach((set) => {
      const key = `${normalizeExercise(set.exercise)}:${set.set_number}`;
      if (values.has(key)) return;
      const parts = [];
      if (set.weight_kg != null) parts.push(`${Number(set.weight_kg)} kg`);
      if (set.reps != null) parts.push(`× ${set.reps}`);
      if (set.distance_km != null) parts.push(`${Number(set.distance_km)} km`);
      if (set.duration_seconds != null) parts.push(`${set.duration_seconds}s`);
      if (parts.length) values.set(key, parts.join(" "));
    }));
    return values;
  }, [recent]);

  const groups = draft ? groupWorkoutSets(draft.sets) : [];
  const elapsed = draft
    ? Math.max(0, Math.floor((now - new Date(draft.performed_at).getTime()) / 1000))
    : 0;
  const restRemaining = draft?.rest_timer_ends_at
    ? Math.max(0, Math.ceil((new Date(draft.rest_timer_ends_at).getTime() - now) / 1000))
    : 0;
  const completedSets = draft?.sets.filter((set) => set.is_completed) ?? [];
  const volume = completedSets.reduce(
    (total, set) => total + Number(set.weight || 0) * Number(set.reps || 0),
    0,
  );

  if (loading) return <section className="session-state" role="status"><RotateCcw className="spin" /><h1>{t("Loading workout…", "Завантажуємо тренування…")}</h1></section>;
  if (loadError) return <section className="session-state error" role="alert"><X /><h1>{loadError}</h1><button className="secondary-button" onClick={() => void load()}>{t("Try again", "Спробувати ще раз")}</button></section>;
  if (!draft) return <div className="session-empty"><EmptyState icon={<Dumbbell size={24} />} title={t("No active workout", "Немає активного тренування")} description={t("Start a workout from the Training workspace.", "Почніть тренування в розділі «Тренування».")} action={t("Back to training", "До тренувань")} onAction={() => router.push("/training")} /></div>;

  return (
    <div className="live-session">
      <header className="session-toolbar">
        <button className="session-back" onClick={() => void goBack()}><ArrowLeft size={19} /> {t("Back", "Назад")}</button>
        <div className="session-clock"><Clock3 size={18} /><span>{elapsedLabel(elapsed)}</span></div>
        <button className="session-finish" onClick={() => setFinishOpen(true)}>{t("Finish", "Завершити")}</button>
      </header>

      <div className={`sync-banner ${syncState}`} role={syncState === "error" ? "alert" : "status"}>
        {syncState === "saving" ? <RotateCcw size={14} className="spin" /> : syncState === "error" ? <X size={14} /> : <Check size={14} />}
        <span>{syncState === "saving" ? t("Saving…", "Зберігаємо…") : syncState === "error" ? syncError : t("Saved", "Збережено")}</span>
        {syncState === "error" && <button onClick={() => draftRef.current && void queueSave(draftRef.current).catch(() => undefined)}>{t("Retry", "Повторити")}</button>}
      </div>

      {restRemaining > 0 && <section className="rest-timer" aria-live="polite">
        <TimerReset size={22} />
        <div><span>{t("Rest", "Відпочинок")}</span><strong>{countdownLabel(restRemaining)}</strong></div>
        <button onClick={() => adjustRest(15)}>+15s</button>
        <button onClick={() => adjustRest(null)}>{t("Skip", "Пропустити")}</button>
      </section>}

      <section className="session-title-card">
        <label><span>{t("Workout", "Тренування")}</span><input value={draft.name} maxLength={200} onChange={(event) => changeDraft((current) => ({ ...current, name: event.target.value }))} /></label>
        <p>{new Intl.DateTimeFormat(intlLocale, { dateStyle: "full", timeStyle: "short" }).format(new Date(draft.performed_at))}</p>
      </section>

      <main className="session-exercises">
        {groups.map((group, exerciseIndex) => <section className="session-exercise-card" key={normalizeExercise(group.exercise)}>
          <div className="session-exercise-heading">
            <label><span>{t("Exercise", "Вправа")} {exerciseIndex + 1}</span><input value={group.exercise} onChange={(event) => {
              const value = event.target.value;
              changeDraft((current) => ({ ...current, sets: current.sets.map((set) => normalizeExercise(set.exercise) === normalizeExercise(group.exercise) ? { ...set, exercise: value } : set) }));
            }} /></label>
            <div><button onClick={() => duplicateExercise(group.exercise)} aria-label={t("Duplicate exercise", "Дублювати вправу")}><Copy size={17} /></button><button className="danger" onClick={() => removeExercise(group.exercise)} aria-label={t("Remove exercise", "Видалити вправу")}><Trash2 size={17} /></button></div>
          </div>
          <div className="session-set-list">{group.sets.map((set) => {
            const hint = previous.get(`${normalizeExercise(set.exercise)}:${set.set_number}`);
            return <article className={`session-set ${set.is_completed ? "complete" : ""}`} key={set.key}>
              <button className="set-check" role="checkbox" aria-checked={set.is_completed} onClick={() => completeSet(set.key)} aria-label={t(`Complete set ${set.set_number}`, `Завершити підхід ${set.set_number}`)}>{set.is_completed ? <Check size={24} /> : set.set_number}</button>
              <div className="session-set-fields"><label><span>{t("kg", "кг")}</span><input data-session-focus={set.key} type="number" min="0" step="0.001" inputMode="decimal" value={set.weight} onChange={(event) => updateSet(set.key, "weight", event.target.value)} /></label><span className="set-times">×</span><label><span>{t("Reps", "Повтори")}</span><input type="number" min="0" inputMode="numeric" value={set.reps} onChange={(event) => updateSet(set.key, "reps", event.target.value)} /></label></div>
              <div className="previous-result"><span>{t("Previous", "Минулого разу")}</span><strong>{hint ?? "—"}</strong></div>
              <details className="session-set-more"><summary>{t("Distance, time & notes", "Відстань, час і нотатки")}</summary><div><label><span>{t("km", "км")}</span><input type="number" min="0" step="0.001" value={set.distance} onChange={(event) => updateSet(set.key, "distance", event.target.value)} /></label><label><span>{t("Seconds", "Секунди")}</span><input type="number" min="0" value={set.duration} onChange={(event) => updateSet(set.key, "duration", event.target.value)} /></label><label><span>{t("Rest", "Відпочинок")}</span><input type="number" min="0" value={set.rest_seconds} onChange={(event) => updateSet(set.key, "rest_seconds", event.target.value)} /></label><label className="set-note"><span>{t("Set note", "Нотатка")}</span><input value={set.notes} onChange={(event) => updateSet(set.key, "notes", event.target.value)} /></label></div></details>
              <button className="remove-session-set" onClick={() => changeDraft((current) => ({ ...current, sets: current.sets.filter((candidate) => candidate.key !== set.key).map((candidate, index) => ({ ...candidate, position: index + 1 })) }))} aria-label={t(`Remove set ${set.set_number}`, `Видалити підхід ${set.set_number}`)}><X size={17} /></button>
            </article>;
          })}</div>
          <button className="add-set-button" onClick={() => addSet(group.exercise)}><Plus size={17} /> {t("Add set", "Додати підхід")}</button>
        </section>)}
        {groups.length === 0 && <EmptyState icon={<Dumbbell size={22} />} title={t("Add your first exercise", "Додайте першу вправу")} description={t("Build this session as you go.", "Складіть це тренування під час виконання.")} action={t("Add exercise", "Додати вправу")} onAction={addExercise} />}
      </main>

      <div className="session-bottom-actions"><button className="secondary-button" onClick={addExercise}><Plus size={17} /> {t("Add exercise", "Додати вправу")}</button><button className="discard-session" onClick={() => void discard()}><Trash2 size={16} /> {t("Discard workout", "Відкинути тренування")}</button></div>

      <label className="session-notes"><span>{t("Session notes", "Нотатки про тренування")}</span><textarea value={draft.notes} rows={3} onChange={(event) => changeDraft((current) => ({ ...current, notes: event.target.value }))} placeholder={t("Energy, technique, or anything to remember", "Самопочуття, техніка чи те, що варто запам’ятати")} /></label>

      <ModuleDialog open={finishOpen} title={t("Finish workout?", "Завершити тренування?")} eyebrow={t("Session summary", "Підсумок тренування")} saving={finishing} onClose={closeFinish}>
        <div className="finish-summary"><CheckCircle2 size={34} /><div className="finish-numbers"><span><strong>{completedSets.length}</strong>{t("completed sets", "виконаних підходів")}</span><span><strong>{Math.round(volume).toLocaleString(intlLocale)}</strong>{t("kg volume", "кг обсягу")}</span><span><strong>{elapsedLabel(elapsed)}</strong>{t("elapsed", "тривалість")}</span></div><p>{t("Unchecked sets will be removed from the finished workout.", "Невиконані підходи буде видалено із завершеного тренування.")}</p><div className="dialog-actions"><button className="secondary-button" disabled={finishing} onClick={() => setFinishOpen(false)}>{t("Keep training", "Продовжити")}</button><button className="submit-button" disabled={finishing} onClick={() => void finish()}>{finishing && <RotateCcw size={16} className="spin" />} {t("Finish workout", "Завершити тренування")}</button></div></div>
      </ModuleDialog>
      {toast && <ModuleToast {...toast} onClose={() => setToast(null)} />}
    </div>
  );
}
