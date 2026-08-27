import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const index = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const render = readFileSync(new URL('../public/render.js', import.meta.url), 'utf8');
const muscleMap = readFileSync(new URL('../public/muscle-map.js', import.meta.url), 'utf8');
const muscleIsland = readFileSync(new URL('../browser/muscle-map-island.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/app.css', import.meta.url), 'utf8');

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
  assert.match(render, /data-plan-field="reps"/);
  assert.doesNotMatch(render, /Rep range/);
  assert.match(app, /muscle: state\.searchMuscle/);
  assert.match(app, /event\.target\.closest\('\[data-muscle\]'\)/);
  assert.match(muscleMap, /data-muscle-map/);
  assert.match(muscleIsland, /react-muscle-highlighter/);
  assert.match(muscleIsland, /gym:body-model|BODY_MODEL_STORAGE_KEY/);
  assert.match(muscleIsland, /muscle-choices/);
  assert.match(muscleIsland, /data-picker|picker/);
  assert.match(index, /id="searchMuscleMap"/);
  assert.match(app, /matchMedia\('\(min-width: 900px\)'\)/);
  assert.match(css, /grid-template-columns: 280px minmax\(0,1fr\)/);
  assert.match(css, /height: calc\(100dvh - 10px\)/);
  assert.match(css, /\.search-dialog \{[^}]*overflow: hidden/);
  assert.match(css, /\.search-card \{[^}]*overflow: hidden/);
  assert.match(css, /\.search-preview \{[^}]*grid-row: 2/);
  assert.match(css, /\.search-preview \.guide-copy \{[^}]*overflow-wrap: anywhere/);
});
