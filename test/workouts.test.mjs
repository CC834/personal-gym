import assert from 'node:assert/strict';
import test from 'node:test';
import { estimatedOneRepMax, finishSession, normalizePlan, normalizeSet } from '../src/workouts.mjs';

test('normalizes a weekly plan without manufacturing extra structure', () => {
  const plan = normalizePlan({ days: [{ weekday: 1, name: 'Push', exercises: [{ exerciseId: 'bench', sets: 3, repMin: 8, repMax: 12, targetGrams: 60_000, incrementGrams: 2_500 }] }] });
  assert.equal(plan.days[0].exercises[0].position, 0);
  assert.equal(plan.days[0].exercises[0].targetGrams, 60_000);
  assert.throws(() => normalizePlan({ days: [{ weekday: 1, name: 'A', exercises: [] }, { weekday: 1, name: 'B', exercises: [] }] }), /only one workout/);
});

test('double progression requires every prescribed set at the top of the range', () => {
  const complete = finishSession([{ id: 'one', prescribedSets: 3, repMax: 12, targetGrams: 50_000, incrementGrams: 2_500, sets: [
    { completed: true, reps: 12, loadGrams: 50_000 }, { completed: true, reps: 13, loadGrams: 50_000 }, { completed: true, reps: 12, loadGrams: 52_500 }
  ] }]);
  assert.equal(complete.status, 'completed');
  assert.deepEqual(complete.progression[0], { sessionExerciseId: 'one', complete: true, qualified: true, suggestionType: 'load', suggestedGrams: 52_500, suggestedRepMin: null, suggestedRepMax: null });

  const partial = finishSession([{ id: 'two', prescribedSets: 2, repMax: 10, targetGrams: 0, incrementGrams: 2_500, sets: [
    { completed: true, reps: 10, loadGrams: 0 }, { completed: false, reps: null, loadGrams: null }
  ] }]);
  assert.equal(partial.status, 'partial');
  assert.equal(partial.progression[0].qualified, false);
});

test('bodyweight progression increases the single rep target before adding load', () => {
  const result = finishSession([{ id: 'push-up', equipment: 'body weight', prescribedSets: 2, repMin: 8, repMax: 12, targetGrams: 0, incrementGrams: 2_500, sets: [
    { completed: true, reps: 12, loadGrams: 0 }, { completed: true, reps: 12, loadGrams: 0 }
  ] }]);
  assert.equal(result.progression[0].suggestionType, 'reps');
  assert.equal(result.progression[0].suggestedRepMin, 14);
  assert.equal(result.progression[0].suggestedRepMax, 14);
  assert.equal(result.progression[0].suggestedGrams, null);
});

test('keeps valid draft values before a set is marked complete', () => {
  assert.deepEqual(normalizeSet({ setNumber: 1, completed: false, reps: 9, loadGrams: 42_500 }, 3), {
    setNumber: 1, completed: false, reps: 9, loadGrams: 42_500
  });
});

test('estimated one-rep max uses Epley and excludes zero load', () => {
  assert.equal(estimatedOneRepMax(60_000, 10), 80_000);
  assert.equal(estimatedOneRepMax(0, 20), null);
});
