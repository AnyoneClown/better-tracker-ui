"use client";

import { Activity, Clock3, Dumbbell, Edit3, Plus, Route, Trash2, Trophy, X } from "lucide-react";
import type { FormEvent } from "react";
import { useCallback, useState } from "react";

import { DataNotice, EmptyState, ModuleDialog, ModuleHeader, ModuleState, ModuleToast, SaveActions } from "@/components/module-ui";
import { useModuleData } from "@/hooks/use-module-data";
import { asNumber, createRecord, deleteRecord, fetchTrainingData, type Workout, type WorkoutSet, updateRecord } from "@/lib/module-api";
import { getPeriod } from "@/lib/tracker-api";

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

function formatWorkoutDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

export default function TrainingPage({ initialPeriodKey }: { initialPeriodKey: string }) {
  const [periodKey, setPeriodKey] = useState(initialPeriodKey);
  const { data, loading, error, refresh } = useModuleData(periodKey, fetchTrainingData);
  const [editing, setEditing] = useState<Workout | "new" | null>(null);
  const [setDrafts, setSetDrafts] = useState<SetDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const period = data?.period ?? getPeriod(periodKey, new Date(`${initialPeriodKey}-15T12:00:00Z`));
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
      setToast({ message: "Every exercise set needs a name and at least one metric.", tone: "error" });
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
      setToast({ message: editing === "new" ? "Workout added" : "Workout updated", tone: "success" });
      refresh();
    } catch (reason) {
      setToast({ message: reason instanceof Error ? reason.message : "Could not save the workout.", tone: "error" });
    } finally {
      setSaving(false);
    }
  };

  const removeWorkout = async (workout: Workout) => {
    if (!window.confirm(`Delete “${workout.name}”?`)) return;
    try {
      await deleteRecord(`/workouts/${workout.id}`);
      setToast({ message: "Workout deleted", tone: "success" });
      refresh();
    } catch (reason) {
      setToast({ message: reason instanceof Error ? reason.message : "Could not delete the workout.", tone: "error" });
    }
  };

  const summary = data?.summary;
  const average = summary?.average_duration_minutes === null ? null : asNumber(summary?.average_duration_minutes);

  return (
    <>
      <ModuleHeader eyebrow="Training" title="Put the work on record." description="Plan less from memory: log sessions, exercises, sets, reps, load, distance, and time." periodKey={periodKey} initialPeriodKey={initialPeriodKey} onPeriodChange={setPeriodKey} onAdd={openNew} addLabel="Add workout" />
      {data && <DataNotice loading={loading} error={error} onRetry={refresh} />}
      {!data ? <ModuleState error={error} onRetry={refresh} /> : (
        <>
          <section className="module-stats module-stats-four" aria-label="Training summary">
            <article className="module-stat"><span className="stat-icon forest"><Dumbbell size={18} /></span><p>Sessions</p><strong>{summary?.workout_count ?? 0}</strong><em>{summary?.total_sets ?? 0} total sets</em></article>
            <article className="module-stat"><span className="stat-icon lime"><Clock3 size={18} /></span><p>Training time</p><strong>{formatDuration(summary?.total_duration_minutes ?? 0)}</strong><em>{average === null ? "No duration average" : `${Math.round(average)} min average`}</em></article>
            <article className="module-stat"><span className="stat-icon amber"><Trophy size={18} /></span><p>Volume</p><strong>{Math.round(asNumber(summary?.total_volume_kg)).toLocaleString()} <small>kg</small></strong><em>{summary?.total_reps ?? 0} total reps</em></article>
            <article className="module-stat"><span className="stat-icon blue"><Route size={18} /></span><p>Distance</p><strong>{asNumber(summary?.total_distance_km).toFixed(1)} <small>km</small></strong><em>{summary?.total_set_duration_seconds ?? 0} active seconds</em></article>
          </section>

          <div className="module-two-column training-layout">
            <section className="module-section">
              <div className="section-heading"><div><p className="eyebrow">Session log</p><h2>{period.label} workouts</h2></div><span className="record-count">{data.workouts.length} sessions</span></div>
              {data.workouts.length > 0 ? (
                <div className="workout-list">
                  {data.workouts.map((workout) => {
                    const exercises = Array.from(new Set(workout.sets.map((set) => set.exercise)));
                    return (
                      <article className="workout-record" key={workout.id}>
                        <div className="workout-record-top">
                          <div className="workout-symbol"><Dumbbell size={19} /></div>
                          <div className="record-primary"><h3>{workout.name}</h3><p>{formatWorkoutDate(workout.performed_at)}{workout.duration_minutes ? ` · ${formatDuration(workout.duration_minutes)}` : ""}</p></div>
                          <div className="record-actions">
                            <button onClick={() => openEdit(workout)} aria-label={`Edit ${workout.name}`}><Edit3 size={16} /></button>
                            <button className="danger" onClick={() => void removeWorkout(workout)} aria-label={`Delete ${workout.name}`}><Trash2 size={16} /></button>
                          </div>
                        </div>
                        {exercises.length > 0 ? <div className="exercise-tags">{exercises.map((exercise) => <span key={exercise}>{exercise}<small>{workout.sets.filter((set) => set.exercise === exercise).length} sets</small></span>)}</div> : <p className="workout-note">No sets recorded for this session.</p>}
                        {workout.notes && <p className="workout-note">{workout.notes}</p>}
                      </article>
                    );
                  })}
                </div>
              ) : <EmptyState icon={<Dumbbell size={22} />} title="No workouts this month" description="Add your first session, then track sets and performance over time." action="Add workout" onAction={openNew} />}
            </section>

            <section className="module-section exercise-summary">
              <div className="section-heading"><div><p className="eyebrow">Exercise totals</p><h2>Work performed</h2></div></div>
              {summary && summary.exercises.length > 0 ? (
                <div className="exercise-table">
                  {summary.exercises.map((exercise) => (
                    <div className="exercise-row" key={exercise.exercise}>
                      <div><strong>{exercise.exercise}</strong><span>{exercise.sets} sets · {exercise.total_reps} reps</span></div>
                      <div><strong>{Math.round(asNumber(exercise.volume_kg)).toLocaleString()} kg</strong><span>{asNumber(exercise.distance_km) > 0 ? `${asNumber(exercise.distance_km).toFixed(1)} km` : exercise.duration_seconds > 0 ? `${exercise.duration_seconds}s` : "volume"}</span></div>
                    </div>
                  ))}
                </div>
              ) : <EmptyState icon={<Activity size={22} />} title="No exercise totals yet" description="Sets with reps, weight, distance, or time will roll up here." />}
            </section>
          </div>
        </>
      )}

      <ModuleDialog open={editing !== null} title={editing === "new" ? "Add a workout" : "Edit workout"} eyebrow="Training" saving={saving} onClose={closeDialog}>
        <form className="log-form workout-form" onSubmit={saveWorkout} key={editing === "new" ? "new" : editing?.id}>
          <label><span>Session name</span><input name="name" maxLength={200} defaultValue={editing === "new" ? "" : editing?.name} placeholder="Lower body strength" required /></label>
          <div className="form-grid">
            <label><span>Date and time</span><input name="performed_at" type="datetime-local" min={`${period.startDate}T00:00`} max={`${period.endDate}T23:59`} defaultValue={editing === "new" ? `${period.referenceDate}T18:00` : dateTimeLocal(editing?.performed_at ?? "")} required /></label>
            <label><span>Duration</span><div className="input-unit"><input name="duration_minutes" type="number" min="1" defaultValue={editing === "new" ? 60 : editing?.duration_minutes ?? ""} /><em>min</em></div></label>
          </div>
          <label><span>Notes</span><textarea name="notes" rows={2} defaultValue={editing === "new" ? "" : editing?.notes ?? ""} placeholder="Energy, focus, or session notes" /></label>

          <div className="sets-heading"><div><span>Exercise sets</span><small>Add whichever metric makes sense for the movement.</small></div><button type="button" className="secondary-button" onClick={() => setSetDrafts((sets) => [...sets, createSetDraft()])}><Plus size={15} /> Add set</button></div>
          <div className="set-editor-list">
            {setDrafts.map((set, index) => (
              <div className="set-editor" key={set.id}>
                <span className="set-number">{index + 1}</span>
                <label className="set-exercise"><span>Exercise</span><input value={set.exercise} onChange={(event) => updateSet(set.id, "exercise", event.target.value)} placeholder="Squat" required /></label>
                <label><span>Reps</span><input type="number" min="0" value={set.reps} onChange={(event) => updateSet(set.id, "reps", event.target.value)} placeholder="8" /></label>
                <label><span>kg</span><input type="number" min="0" step="0.001" value={set.weight} onChange={(event) => updateSet(set.id, "weight", event.target.value)} placeholder="80" /></label>
                <label><span>km</span><input type="number" min="0" step="0.001" value={set.distance} onChange={(event) => updateSet(set.id, "distance", event.target.value)} placeholder="—" /></label>
                <label><span>Seconds</span><input type="number" min="0" value={set.duration} onChange={(event) => updateSet(set.id, "duration", event.target.value)} placeholder="—" /></label>
                <button type="button" className="remove-set" onClick={() => setSetDrafts((sets) => sets.filter((item) => item.id !== set.id))} aria-label={`Remove set ${index + 1}`}><X size={16} /></button>
              </div>
            ))}
            {setDrafts.length === 0 && <p className="sets-empty">No sets added. You can still save a session-only workout.</p>}
          </div>
          <SaveActions saving={saving} onCancel={closeDialog} label={editing === "new" ? "Add workout" : "Save changes"} />
        </form>
      </ModuleDialog>
      {toast && <ModuleToast {...toast} onClose={() => setToast(null)} />}
    </>
  );
}
