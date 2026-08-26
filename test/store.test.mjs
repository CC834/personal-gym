import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { GymStore } from '../src/store.mjs';

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'gym-store-'));
  const store = new GymStore({ databasePath: join(directory, 'gym.sqlite3') });
  return { directory, store, close() { store.close(); rmSync(directory, { recursive: true, force: true }); } };
}

function saveBasicPlan(store) {
  return store.savePlan({ days: [{ weekday: 1, name: 'Push', exercises: [{ exerciseId: 'local:barbell-bench-press', sets: 2, repMin: 8, repMax: 10, targetGrams: 50_000, incrementGrams: 2_500 }] }] });
}

test('snapshots a workout, saves every set, and confirms progression', () => {
  const value = fixture();
  try {
    const plan = saveBasicPlan(value.store);
    let session = value.store.startSession(plan.days[0].id, '2026-08-24');
    const exercise = session.exercises[0];
    session = value.store.updateSet(session.id, exercise.id, { setNumber: 1, completed: true, reps: 10, loadGrams: 50_000 }, '2026-08-24');
    session = value.store.updateSet(session.id, exercise.id, { setNumber: 2, completed: true, reps: 10, loadGrams: 50_000 }, '2026-08-24');
    session = value.store.completeSession(session.id);
    assert.equal(session.status, 'completed');
    assert.equal(session.exercises[0].suggestedGrams, 52_500);
    value.store.decideProgression(exercise.id, 'accepted');
    assert.equal(value.store.plan().days[0].exercises[0].targetGrams, 52_500);
  } finally { value.close(); }
});

test('keeps session snapshots stable and blocks corrections older than seven days', () => {
  const value = fixture();
  try {
    const plan = saveBasicPlan(value.store);
    let session = value.store.startSession(plan.days[0].id, '2026-08-01');
    const exercise = session.exercises[0];
    session = value.store.completeSession(session.id);
    value.store.savePlan({ days: [{ ...plan.days[0], name: 'Changed', exercises: [{ ...plan.days[0].exercises[0], targetGrams: 70_000 }] }] });
    assert.equal(value.store.session(session.id).exercises[0].targetGrams, 50_000);
    assert.throws(() => value.store.updateSet(session.id, exercise.id, { setNumber: 1, completed: true, reps: 8, loadGrams: 50_000 }, '2026-08-10'), /no longer be edited/);
  } finally { value.close(); }
});

test('persists incomplete set drafts and recalculates corrected session status', () => {
  const value = fixture();
  try {
    const plan = saveBasicPlan(value.store);
    let session = value.store.startSession(plan.days[0].id, '2026-08-24');
    const exercise = session.exercises[0];
    session = value.store.updateSet(session.id, exercise.id, { setNumber: 1, completed: false, reps: 9, loadGrams: 50_000 }, '2026-08-24');
    assert.deepEqual(session.exercises[0].sets[0], { setNumber: 1, reps: 9, loadGrams: 50_000, completed: false });
    session = value.store.completeSession(session.id);
    assert.equal(session.status, 'partial');
    value.store.updateSet(session.id, exercise.id, { setNumber: 1, completed: true, reps: 9, loadGrams: 50_000 }, '2026-08-24');
    session = value.store.updateSet(session.id, exercise.id, { setNumber: 2, completed: true, reps: 9, loadGrams: 50_000 }, '2026-08-24');
    assert.equal(session.status, 'completed');
    session = value.store.updateSet(session.id, exercise.id, { setNumber: 2, completed: false, reps: 9, loadGrams: 50_000 }, '2026-08-24');
    assert.equal(session.status, 'partial');
  } finally { value.close(); }
});

test('adds and removes session-only extra sets without changing the weekly plan', () => {
  const value = fixture();
  try {
    const plan = saveBasicPlan(value.store);
    let session = value.store.startSession(plan.days[0].id, '2026-08-24');
    const exercise = session.exercises[0];
    session = value.store.addSessionSet(session.id, exercise.id);
    assert.equal(session.exercises[0].plannedSets, 2);
    assert.equal(session.exercises[0].prescribedSets, 3);
    assert.deepEqual(session.exercises[0].sets[2], { setNumber: 3, reps: null, loadGrams: null, completed: false });
    assert.equal(value.store.plan().days[0].exercises[0].sets, 2);
    assert.throws(() => value.store.removeExtraSessionSet(session.id, exercise.id, 2), /Only the last set/);
    session = value.store.removeExtraSessionSet(session.id, exercise.id, 3);
    assert.equal(session.exercises[0].prescribedSets, 2);
    assert.equal(session.exercises[0].sets.length, 2);
  } finally { value.close(); }
});

test('applies pending progression by plan and catalog identity after plan edits', () => {
  const value = fixture();
  try {
    let plan = saveBasicPlan(value.store);
    let session = value.store.startSession(plan.days[0].id, '2026-08-24');
    const exercise = session.exercises[0];
    value.store.updateSet(session.id, exercise.id, { setNumber: 1, completed: true, reps: 10, loadGrams: 50_000 }, '2026-08-24');
    value.store.updateSet(session.id, exercise.id, { setNumber: 2, completed: true, reps: 10, loadGrams: 50_000 }, '2026-08-24');
    value.store.completeSession(session.id);
    plan = value.store.plan();
    value.store.savePlan({ days: [{ ...plan.days[0], name: 'Push revised', exercises: plan.days[0].exercises }] });
    value.store.decideProgression(exercise.id, 'accepted');
    assert.equal(value.store.plan().days[0].exercises[0].targetGrams, 52_500);
  } finally { value.close(); }
});

test('advances unweighted bodyweight exercises by reps and can cancel an active workout', () => {
  const value = fixture();
  try {
    const plan = value.store.savePlan({ days: [{ weekday: 1, name: 'Bodyweight', exercises: [{ exerciseId: 'local:push-up', sets: 1, repMin: 8, repMax: 12, targetGrams: 0, incrementGrams: 2_500 }] }] });
    let session = value.store.startSession(plan.days[0].id, '2026-08-24');
    value.store.updateSet(session.id, session.exercises[0].id, { setNumber: 1, completed: true, reps: 12, loadGrams: 0 }, '2026-08-24');
    session = value.store.completeSession(session.id);
    assert.equal(session.exercises[0].suggestionType, 'reps');
    value.store.decideProgression(session.exercises[0].id, 'accepted');
    assert.equal(value.store.plan().days[0].exercises[0].repMax, 14);
    const second = value.store.startSession(plan.days[0].id, '2026-08-24');
    value.store.cancelSession(second.id);
    assert.equal(value.store.activeSession(), null);
  } finally { value.close(); }
});

test('updates and deletes dated body-weight entries', () => {
  const value = fixture();
  try {
    value.store.saveBodyWeight('2026-08-20', 80_000);
    value.store.saveBodyWeight('2026-08-20', 79_500);
    assert.equal(value.store.bodyWeights()[0].grams, 79_500);
    assert.deepEqual(value.store.deleteBodyWeight('2026-08-20'), []);
  } finally { value.close(); }
});

test('summarizes body weight, consistency, and raw exercise history', () => {
  const value = fixture();
  try {
    const plan = saveBasicPlan(value.store);
    let session = value.store.startSession(plan.days[0].id, '2026-08-24');
    const exercise = session.exercises[0];
    value.store.updateSet(session.id, exercise.id, { setNumber: 1, completed: true, reps: 8, loadGrams: 60_000 }, '2026-08-24');
    value.store.completeSession(session.id);
    value.store.saveBodyWeight('2026-07-25', 80_000);
    value.store.saveBodyWeight('2026-08-24', 81_000);
    const progress = value.store.progress('2026-08-24', 'local:barbell-bench-press');
    assert.equal(progress.sessionsLastFourWeeks, 1);
    assert.equal(progress.weightChangeGrams, 1_000);
    assert.equal(progress.trend[0].estimatedOneRepMaxGrams, 76_000);
  } finally { value.close(); }
});

test('removes unreferenced starter placeholders after a full catalog import', () => {
  const value = fixture();
  try {
    value.store.importCatalog([{
      id: '0025', name: 'barbell bench press', bodyPart: 'chest', equipment: 'barbell', target: 'pectorals',
      muscleGroup: 'chest', secondaryMuscles: [], instructions: ['Press upward.'], imagePath: 'images/0025.jpg',
      gifPath: 'videos/0025.gif', attribution: '© source', source: 'hasaneyldrm/exercises-dataset'
    }], 'test-revision');
    assert.equal(value.store.catalogStatus().count, 1);
    assert.equal(value.store.searchExercises({ query: 'bench press' }).items[0].id, '0025');
  } finally { value.close(); }
});

test('creates searchable custom exercises and includes them in catalog exports', () => {
  const value = fixture();
  try {
    const input = { name: 'Cable lateral raise', bodyPart: 'shoulders', equipment: 'cable', target: 'delts', instructions: ['Raise with control.'] };
    const exercise = value.store.createCustomExercise(input);
    assert.match(exercise.id, /^custom:/);
    assert.deepEqual(exercise.instructions, ['Raise with control.']);
    assert.equal(value.store.searchExercises({ query: 'lateral raise' }).items[0].id, exercise.id);
    assert.equal(value.store.exportExercises().find((item) => item.id === exercise.id).custom, true);
    assert.throws(() => value.store.createCustomExercise(input), /already exists/);
  } finally { value.close(); }
});

test('maps plan and session muscles and searches both primary and secondary groups', () => {
  const value = fixture();
  try {
    const custom = value.store.createCustomExercise({
      name: 'Personal shoulder press', bodyPart: 'shoulders', equipment: 'dumbbell', target: 'delts', instructions: []
    });
    const plan = value.store.savePlan({ days: [{ weekday: 2, name: 'Shoulders', exercises: [{
      exerciseId: custom.id, sets: 3, repMin: 8, repMax: 12, targetGrams: 10_000, incrementGrams: 1_000
    }] }] });
    assert.deepEqual(plan.days[0].exercises[0].muscles, { primary: 'shoulders', secondary: [] });
    assert.equal(value.store.searchExercises({ muscle: 'shoulders' }).items.some((exercise) => exercise.id === custom.id), true);
    const session = value.store.startSession(plan.days[0].id, '2026-08-25');
    assert.deepEqual(session.exercises[0].muscles, { primary: 'shoulders', secondary: [] });
    assert.throws(() => value.store.searchExercises({ muscle: 'not-a-muscle' }), /valid muscle group/);
  } finally { value.close(); }
});
