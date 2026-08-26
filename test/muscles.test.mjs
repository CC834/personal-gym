import assert from 'node:assert/strict';
import test from 'node:test';
import { aliasesForMuscle, muscleOptions, musclesForExercise } from '../src/muscles.mjs';

test('normalizes catalog aliases into primary and secondary body-map regions', () => {
  assert.deepEqual(musclesForExercise({
    target: 'pectorals', muscleGroup: 'triceps', secondaryMuscles: ['deltoids', 'triceps', 'core']
  }), { primary: 'chest', secondary: ['triceps', 'shoulders', 'core'] });
  assert.deepEqual(musclesForExercise({
    target: 'quads', muscleGroup: 'hamstrings', secondaryMuscles: ['quadriceps', 'calves']
  }), { primary: 'quads', secondary: ['hamstrings', 'calves'] });
});

test('provides bounded aliases for muscle-filtered exercise search', () => {
  assert.ok(aliasesForMuscle('shoulders').includes('delts'));
  assert.ok(muscleOptions().some((muscle) => muscle.id === 'lats' && muscle.label === 'Lats'));
  assert.throws(() => aliasesForMuscle('unknown'), /valid muscle group/);
});
