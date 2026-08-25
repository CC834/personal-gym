import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { licensedMediaFile, normalizeCatalogRecord, normalizeCustomExercise } from '../src/catalog.mjs';

test('normalizes the external catalog and rejects traversal media paths', () => {
  const item = normalizeCatalogRecord({
    id: '0001', name: 'Bench press', body_part: 'chest', equipment: 'barbell', target: 'pectorals',
    instruction_steps: { en: ['Lie down.', 'Press upward.'] }, image: '../secret.jpg', gif_url: 'videos/0001.gif', attribution: '© source'
  });
  assert.equal(item.imagePath, null);
  assert.equal(item.gifPath, 'videos/0001.gif');
  assert.deepEqual(item.instructions, ['Lie down.', 'Press upward.']);
});

test('only resolves media inside the configured licensed directory', () => {
  const directory = mkdtempSync(join(tmpdir(), 'gym-media-'));
  try {
    mkdirSync(join(directory, 'videos'));
    writeFileSync(join(directory, 'videos', 'demo.gif'), 'GIF89a');
    assert.equal(licensedMediaFile(directory, 'videos/demo.gif'), join(directory, 'videos', 'demo.gif'));
    assert.equal(licensedMediaFile(directory, '../demo.gif'), null);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('normalizes bounded custom exercise details', () => {
  assert.deepEqual(normalizeCustomExercise({
    name: ' Cable lateral raise ', bodyPart: 'shoulders', equipment: 'cable', target: 'delts',
    instructions: [' Stand tall. ', '', 'Raise with control.']
  }), {
    name: 'Cable lateral raise', bodyPart: 'shoulders', equipment: 'cable', target: 'delts',
    instructions: ['Stand tall.', 'Raise with control.']
  });
  assert.throws(() => normalizeCustomExercise({ name: '', bodyPart: 'back', equipment: 'cable', target: 'lats' }), /Exercise name/);
});
