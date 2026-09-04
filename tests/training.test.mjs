import assert from "node:assert/strict";
import test from "node:test";

import {
  completedSetPayload,
  expandRoutine,
  groupWorkoutSets,
  nextDraftKey,
  repeatWorkout,
  STARTER_ROUTINES,
} from "../lib/training.ts";

test("expands all six strength starters into unchecked ordered targets", () => {
  assert.equal(STARTER_ROUTINES.length, 6);
  const fullBody = expandRoutine(
    STARTER_ROUTINES[0].name,
    STARTER_ROUTINES[0].exercises,
    "2026-09-04T10:00:00.000Z",
  );
  assert.equal(fullBody.sets.length, 9);
  assert.deepEqual(fullBody.sets.slice(0, 3).map((set) => set.set_number), [1, 2, 3]);
  assert.ok(fullBody.sets.every((set) => !set.is_completed));
  assert.ok(fullBody.sets.every((set, index) => set.position === index + 1));
  assert.equal(fullBody.sets[0].weight_kg, null);
});

test("repeat clones ordered metrics but resets session state", () => {
  const repeated = repeatWorkout({
    name: "Heavy day",
    sets: [
      {
        exercise: "squat",
        set_number: 1,
        position: 1,
        reps: 5,
        weight_kg: "100.000",
        distance_km: null,
        duration_seconds: null,
        notes: "solid",
        is_completed: true,
        rest_seconds: 180,
      },
    ],
  }, "2026-09-04T10:00:00.000Z");
  assert.equal(repeated.notes, null);
  assert.equal(repeated.duration_minutes, null);
  assert.equal(repeated.sets[0].weight_kg, "100.000");
  assert.equal(repeated.sets[0].is_completed, false);
});

test("draft keys stay unique without secure-context APIs", () => {
  const first = nextDraftKey();
  const second = nextDraftKey();
  assert.notEqual(first, second);
  assert.match(first, /^draft-\d+$/);
});

test("groups normalized exercise names in position order", () => {
  const grouped = groupWorkoutSets([
    { exercise: " Bench   Press ", set_number: 2, position: 2, reps: 5, weight_kg: 60, distance_km: null, duration_seconds: null, notes: null },
    { exercise: "bench press", set_number: 1, position: 1, reps: 5, weight_kg: 60, distance_km: null, duration_seconds: null, notes: null },
  ]);
  assert.equal(grouped.length, 1);
  assert.deepEqual(grouped[0].sets.map((set) => set.set_number), [1, 2]);
});

test("completed payload filters and renumbers retained sets", () => {
  const sets = completedSetPayload([
    { exercise: "squat", set_number: 1, position: 1, reps: 5, weight_kg: 80, distance_km: null, duration_seconds: null, notes: null, is_completed: false },
    { exercise: "squat", set_number: 2, position: 2, reps: 5, weight_kg: 80, distance_km: null, duration_seconds: null, notes: null, is_completed: true },
    { exercise: "row", set_number: 1, position: 3, reps: 8, weight_kg: 50, distance_km: null, duration_seconds: null, notes: null, is_completed: true },
  ]);
  assert.deepEqual(sets.map((set) => [set.exercise, set.set_number, set.position]), [
    ["squat", 1, 1],
    ["row", 1, 2],
  ]);
});
