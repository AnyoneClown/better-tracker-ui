export type TrainingSet = {
  exercise: string;
  set_number: number;
  position?: number;
  reps: number | null;
  weight_kg: string | number | null;
  distance_km: string | number | null;
  duration_seconds: number | null;
  notes: string | null;
  is_completed?: boolean;
  rest_seconds?: number | null;
};

export type RoutineExercise = {
  exercise: string;
  setCount: number;
  targetReps: number;
  targetWeightKg: number | null;
  restSeconds: number;
  notes: string | null;
};

export type StarterRoutine = {
  id: string;
  name: string;
  ukName: string;
  exercises: RoutineExercise[];
};

const exercise = (
  name: string,
  setCount: number,
  targetReps: number,
  restSeconds: number,
): RoutineExercise => ({
  exercise: name,
  setCount,
  targetReps,
  targetWeightKg: null,
  restSeconds,
  notes: null,
});

export const STARTER_ROUTINES: StarterRoutine[] = [
  {
    id: "full-body",
    name: "Full Body",
    ukName: "Усе тіло",
    exercises: [
      exercise("Back Squat", 3, 5, 180),
      exercise("Bench Press", 3, 5, 180),
      exercise("Barbell Row", 3, 8, 120),
    ],
  },
  {
    id: "upper",
    name: "Upper",
    ukName: "Верх тіла",
    exercises: [
      exercise("Bench Press", 3, 8, 180),
      exercise("Barbell Row", 3, 8, 120),
      exercise("Overhead Press", 3, 10, 120),
      exercise("Lat Pulldown", 3, 10, 120),
    ],
  },
  {
    id: "lower",
    name: "Lower",
    ukName: "Низ тіла",
    exercises: [
      exercise("Back Squat", 3, 5, 180),
      exercise("Romanian Deadlift", 3, 8, 120),
      exercise("Leg Press", 3, 10, 120),
      exercise("Calf Raise", 3, 15, 60),
    ],
  },
  {
    id: "push",
    name: "Push",
    ukName: "Жимові",
    exercises: [
      exercise("Bench Press", 3, 8, 180),
      exercise("Overhead Press", 3, 8, 120),
      exercise("Incline Dumbbell Press", 3, 10, 120),
      exercise("Triceps Pushdown", 3, 12, 60),
    ],
  },
  {
    id: "pull",
    name: "Pull",
    ukName: "Тягові",
    exercises: [
      exercise("Deadlift", 3, 5, 180),
      exercise("Barbell Row", 3, 8, 120),
      exercise("Lat Pulldown", 3, 10, 120),
      exercise("Biceps Curl", 3, 12, 60),
    ],
  },
  {
    id: "legs",
    name: "Legs",
    ukName: "Ноги",
    exercises: [
      exercise("Back Squat", 4, 6, 180),
      exercise("Romanian Deadlift", 3, 8, 120),
      exercise("Bulgarian Split Squat", 3, 10, 120),
      exercise("Leg Curl", 3, 12, 60),
      exercise("Calf Raise", 3, 15, 60),
    ],
  },
];

let draftSequence = 0;

export function nextDraftKey(): string {
  draftSequence += 1;
  return `draft-${draftSequence}`;
}

export function normalizeExercise(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

export function groupWorkoutSets<T extends { exercise: string; position?: number }>(sets: T[]): Array<{
  exercise: string;
  sets: T[];
}> {
  const groups = new Map<string, { exercise: string; sets: T[] }>();
  [...sets]
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .forEach((set) => {
      const key = normalizeExercise(set.exercise);
      const group = groups.get(key) ?? { exercise: set.exercise.trim(), sets: [] };
      group.sets.push(set);
      groups.set(key, group);
    });
  return [...groups.values()];
}

export function expandRoutine(
  name: string,
  exercises: RoutineExercise[],
  performedAt = new Date().toISOString(),
) {
  let position = 0;
  return {
    name,
    performed_at: performedAt,
    duration_minutes: null,
    notes: null,
    sets: exercises.flatMap((item) =>
      Array.from({ length: item.setCount }, (_, index) => ({
        exercise: item.exercise,
        set_number: index + 1,
        position: ++position,
        reps: item.targetReps,
        weight_kg: item.targetWeightKg,
        distance_km: null,
        duration_seconds: null,
        notes: item.notes,
        is_completed: false,
        rest_seconds: item.restSeconds,
      })),
    ),
  };
}

export function repeatWorkout<T extends {
  name: string;
  sets: TrainingSet[];
}>(workout: T, performedAt = new Date().toISOString()) {
  return {
    name: workout.name,
    performed_at: performedAt,
    duration_minutes: null,
    notes: null,
    sets: [...workout.sets]
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((set, index) => ({
        exercise: set.exercise,
        set_number: set.set_number,
        position: index + 1,
        reps: set.reps,
        weight_kg: set.weight_kg,
        distance_km: set.distance_km,
        duration_seconds: set.duration_seconds,
        notes: set.notes,
        is_completed: false,
        rest_seconds: set.rest_seconds ?? null,
      })),
  };
}

export function completedSetPayload(sets: TrainingSet[]) {
  const counts = new Map<string, number>();
  return [...sets]
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .filter((set) => set.is_completed)
    .map((set, index) => {
      const key = normalizeExercise(set.exercise);
      const setNumber = (counts.get(key) ?? 0) + 1;
      counts.set(key, setNumber);
      return { ...set, position: index + 1, set_number: setNumber };
    });
}
