import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const index = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const render = readFileSync(new URL('../public/render.js', import.meta.url), 'utf8');
const muscleMap = readFileSync(new URL('../public/muscle-map.js', import.meta.url), 'utf8');

test('binds the top-level tab navigation outside main', () => {
  assert.match(index, /<nav class="tabs"/);
  assert.match(index, /data-tab="library"/);
  assert.match(app, /tabs\.addEventListener\('click'/);
});

test('keeps handlers for the important rendered workflow controls', () => {
  for (const control of ['data-cancel-workout', 'data-add-set', 'data-remove-extra-set', 'data-preview-exercise', 'data-edit-weight', 'data-delete-weight']) {
    assert.match(render, new RegExp(control));
    assert.match(app, new RegExp(control));
  }
  assert.match(index, /id="targetFilter"/);
  assert.match(app, /beforeunload/);
  assert.match(render, /class="plan-animation"/);
  assert.match(render, /mediaUrl\(exercise\.exerciseId, 'gif'\)/);
  for (const control of ['data-export-plan', 'data-export-exercises', 'customExerciseForm', 'planImport']) {
    assert.match(render, new RegExp(control));
    assert.match(app, new RegExp(control));
  }
  assert.match(render, /renderMuscleMap\(focusExercises/);
  assert.match(render, /renderMuscleMap\(selected\.exercises, \{ interactive: true \}\)/);
  assert.match(app, /muscle: state\.searchMuscle/);
  assert.match(app, /event\.target\.closest\('\[data-muscle\]'\)/);
  assert.match(muscleMap, /role="button" tabindex="0"/);
});
