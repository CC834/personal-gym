import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createGymApp } from '../src/server.mjs';

test('serves the private mounted Gym API and validates mutations', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'gym-server-'));
  const config = {
    host: '127.0.0.1', port: 0, mountPath: '/gym', timezone: 'Europe/Stockholm',
    allowedTailscaleLogin: 'owner@example.com', allowedOrigin: 'http://gym.test', cookieSecure: false,
    databasePath: join(directory, 'gym.sqlite3'), sessionSecretFile: join(directory, 'secret'), licensedMediaDirectory: ''
  };
  const app = createGymApp(config, { now: () => new Date('2026-08-24T10:00:00Z') });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const { port } = app.server.address();
  const origin = `http://127.0.0.1:${port}`;
  try {
    assert.equal((await fetch(`${origin}/gym/api/bootstrap`)).status, 401);
    const owner = { 'tailscale-user-login': 'owner@example.com' };
    const bootstrapResponse = await fetch(`${origin}/gym/api/bootstrap`, { headers: owner });
    assert.equal(bootstrapResponse.status, 200);
    const bootstrap = await bootstrapResponse.json();
    assert.equal(bootstrap.today, '2026-08-24');
    const cookie = bootstrapResponse.headers.get('set-cookie').split(';')[0];
    const headers = { ...owner, cookie, origin: 'http://gym.test', 'content-type': 'application/json', 'x-csrf-token': bootstrap.csrf };
    const deniedMutation = await fetch(`${origin}/gym/api/plan`, { method: 'PUT', headers: { ...owner, cookie, 'content-type': 'application/json' }, body: '{"days":[]}' });
    assert.equal(deniedMutation.status, 403);
    const plan = await fetch(`${origin}/gym/api/plan`, { method: 'PUT', headers, body: JSON.stringify({ days: [{ weekday: 1, name: 'Push', exercises: [{ exerciseId: 'local:push-up', sets: 2, repMin: 8, repMax: 12, targetGrams: 0, incrementGrams: 2_500 }] }] }) });
    assert.equal(plan.status, 200);
    const savedPlan = (await plan.json()).plan;
    const started = await fetch(`${origin}/gym/api/sessions`, { method: 'POST', headers, body: JSON.stringify({ planId: savedPlan.days[0].id }) });
    let activeSession = (await started.json()).session;
    const exercise = activeSession.exercises[0];
    const addedSet = await fetch(`${origin}/gym/api/sessions/${activeSession.id}/exercises/${exercise.id}/sets`, { method: 'POST', headers, body: '{}' });
    assert.equal(addedSet.status, 201);
    activeSession = (await addedSet.json()).session;
    assert.equal(activeSession.exercises[0].prescribedSets, 3);
    const removedSet = await fetch(`${origin}/gym/api/sessions/${activeSession.id}/exercises/${exercise.id}/sets/3`, { method: 'DELETE', headers, body: '{}' });
    assert.equal((await removedSet.json()).session.exercises[0].prescribedSets, 2);
    const cancelled = await fetch(`${origin}/gym/api/sessions/${activeSession.id}`, { method: 'DELETE', headers, body: '{}' });
    assert.equal(cancelled.status, 200);
    const weight = await fetch(`${origin}/gym/api/body-weight`, { method: 'PUT', headers, body: JSON.stringify({ date: '2026-08-20', grams: 80_000 }) });
    assert.equal(weight.status, 200);
    const deletedWeight = await fetch(`${origin}/gym/api/body-weight`, { method: 'DELETE', headers, body: JSON.stringify({ date: '2026-08-20' }) });
    assert.deepEqual((await deletedWeight.json()).weights, []);
    const custom = await fetch(`${origin}/gym/api/exercises/custom`, { method: 'POST', headers, body: JSON.stringify({ name: 'Cable lateral raise', bodyPart: 'shoulders', equipment: 'cable', target: 'delts', instructions: ['Raise with control.'] }) });
    assert.equal(custom.status, 201);
    assert.match((await custom.json()).exercise.id, /^custom:/);
    const exported = await fetch(`${origin}/gym/api/exercises/export`, { headers: { ...owner, cookie } });
    assert.equal((await exported.json()).exercises.some((exercise) => exercise.name === 'Cable lateral raise' && exercise.custom), true);
    const search = await fetch(`${origin}/gym/api/exercises?q=push`, { headers: { ...owner, cookie } });
    assert.equal((await search.json()).items[0].name, 'Push-up');
    assert.equal((await fetch(`${origin}/gym/health`)).status, 200);
  } finally {
    await new Promise((resolve) => app.server.close(resolve));
    app.store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
