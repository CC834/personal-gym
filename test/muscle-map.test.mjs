import assert from 'node:assert/strict';
import test from 'node:test';
import { muscleMapModel, musclePickerModel } from '../public/muscle-map.js';

test('maps Gym muscle names to the anatomy component', () => {
  const model = muscleMapModel([
    { sets: 3, muscles: { primary: 'shoulders', secondary: ['core', 'calves'] } }
  ]);
  assert.ok(model.some((part) => part.slug === 'deltoids' && part.searchMuscle === 'shoulders' && part.primary === 3));
  assert.ok(model.some((part) => part.slug === 'abs' && part.searchMuscle === 'core'));
  assert.ok(model.some((part) => part.slug === 'calves' && part.searchMuscle === 'calves'));
  assert.ok(model.some((part) => part.slug === 'tibialis' && part.searchMuscle === 'calves'));
});

test('combines lats and upper back into the package region and search group', () => {
  const model = muscleMapModel([
    { sets: 3, muscles: { primary: 'lats', secondary: ['upper_back'] } }
  ]);
  const back = model.find((part) => part.slug === 'upper-back');
  assert.deepEqual(back.muscles, ['lats', 'upper_back']);
  assert.equal(back.searchMuscle, 'back');
  assert.equal(back.primary, 3);
  assert.equal(back.secondary, 3);
});

test('provides every supported region to the exercise muscle picker', () => {
  const model = musclePickerModel();
  assert.ok(model.some((part) => part.slug === 'chest' && part.searchMuscle === 'chest'));
  assert.ok(model.some((part) => part.slug === 'upper-back' && part.searchMuscle === 'back'));
  assert.ok(model.some((part) => part.slug === 'tibialis' && part.searchMuscle === 'calves'));
});
