import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { GymAuth } from './auth.mjs';
import { licensedMediaFile, normalizeCustomExercise } from './catalog.mjs';
import { localDate } from './dates.mjs';
import { GymStore } from './store.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function securityHeaders() {
  return {
    'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()'
  };
}

function send(res, status, body, contentType, headers = {}) {
  const value = Buffer.isBuffer(body) ? body : Buffer.from(body);
  res.writeHead(status, {
    'content-type': contentType,
    'content-length': value.length,
    'cache-control': 'no-store',
    ...securityHeaders(),
    ...headers
  });
  res.end(value);
}

function json(res, status, value) {
  send(res, status, JSON.stringify(value), 'application/json; charset=utf-8');
}

function readBody(req, maxBytes = 256 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(Object.assign(new Error('Request body is too large.'), { statusCode: 413 }));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch { reject(Object.assign(new Error('Invalid JSON.'), { statusCode: 400 })); }
    });
    req.on('error', reject);
  });
}

function requestPath(url, mountPath) {
  const pathname = new URL(url, 'http://gym.local').pathname;
  if (pathname === mountPath) return '/';
  if (pathname.startsWith(`${mountPath}/`)) return pathname.slice(mountPath.length);
  return pathname;
}

function mediaType(path) {
  return ({ '.gif': 'image/gif', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' })[extname(path).toLowerCase()] ?? 'application/octet-stream';
}

export function createGymApp(config, overrides = {}) {
  const store = overrides.store ?? new GymStore(config);
  const auth = overrides.auth ?? new GymAuth({
    secretPath: config.sessionSecretFile,
    allowedLogin: config.allowedTailscaleLogin,
    allowedOrigin: config.allowedOrigin,
    cookieSecure: config.cookieSecure !== false,
    mountPath: config.mountPath
  });
  const now = overrides.now ?? (() => new Date());
  const withMediaAvailability = (exercise) => {
    if (!exercise) return exercise;
    const image = exercise.imageAvailable ? store.mediaRecord(exercise.id, 'image') : null;
    const gif = exercise.gifAvailable ? store.mediaRecord(exercise.id, 'gif') : null;
    return {
      ...exercise,
      imageAvailable: Boolean(image && licensedMediaFile(config.licensedMediaDirectory, image.path)),
      gifAvailable: Boolean(gif && licensedMediaFile(config.licensedMediaDirectory, gif.path))
    };
  };
  const staticFiles = new Map([
    ['/', ['text/html; charset=utf-8', join(root, 'public/index.html')]],
    ['/index.html', ['text/html; charset=utf-8', join(root, 'public/index.html')]],
    ['/app.css', ['text/css; charset=utf-8', join(root, 'public/app.css')]],
    ['/app.js', ['text/javascript; charset=utf-8', join(root, 'public/app.js')]],
    ['/render.js', ['text/javascript; charset=utf-8', join(root, 'public/render.js')]],
    ['/muscle-map.js', ['text/javascript; charset=utf-8', join(root, 'public/muscle-map.js')]]
  ]);

  async function handle(req, res) {
    const path = requestPath(req.url, config.mountPath);
    const url = new URL(req.url, 'http://gym.local');
    if (path === '/health') return json(res, 200, { ok: true, catalog: store.catalogStatus().count });
    const session = auth.session(req, res);
    if (!session) return json(res, 401, { error: 'This gym is only available to its Tailscale owner.' });

    if (req.method === 'GET' && staticFiles.has(path)) {
      const [contentType, file] = staticFiles.get(path);
      return send(res, 200, readFileSync(file), contentType);
    }

    const today = localDate(config.timezone, now());
    if (req.method === 'GET' && path === '/api/bootstrap') {
      const bootstrap = store.bootstrap(today);
      return json(res, 200, { ...bootstrap, catalog: { ...bootstrap.catalog, mediaReady: Boolean(config.licensedMediaDirectory && licensedMediaFile(config.licensedMediaDirectory, 'NOTICE.md')) }, timezone: config.timezone, csrf: session.csrf });
    }
    if (req.method === 'GET' && path === '/api/exercises') {
      const result = store.searchExercises({
        query: url.searchParams.get('q') ?? '',
        bodyPart: url.searchParams.get('bodyPart') ?? '',
        equipment: url.searchParams.get('equipment') ?? '',
        target: url.searchParams.get('target') ?? '',
        muscle: url.searchParams.get('muscle') ?? '',
        limit: url.searchParams.get('limit'),
        offset: url.searchParams.get('offset')
      });
      return json(res, 200, { ...result, items: result.items.map(withMediaAvailability) });
    }
    if (req.method === 'GET' && path === '/api/exercises/export') {
      return json(res, 200, { exercises: store.exportExercises() });
    }
    const exerciseMatch = path.match(/^\/api\/exercises\/([^/]+)$/);
    if (req.method === 'GET' && exerciseMatch) {
      const exercise = withMediaAvailability(store.exercise(decodeURIComponent(exerciseMatch[1])));
      return exercise ? json(res, 200, { exercise }) : json(res, 404, { error: 'Exercise not found.' });
    }
    if (req.method === 'GET' && path === '/api/progress') {
      return json(res, 200, store.progress(today, url.searchParams.get('exerciseId')));
    }
    const sessionGetMatch = path.match(/^\/api\/sessions\/([0-9a-f-]+)$/i);
    if (req.method === 'GET' && sessionGetMatch) {
      const workout = store.session(sessionGetMatch[1]);
      return workout ? json(res, 200, { session: workout }) : json(res, 404, { error: 'Workout not found.' });
    }
    const mediaMatch = path.match(/^\/media\/([^/]+)\/(image|gif)$/);
    if (req.method === 'GET' && mediaMatch) {
      const record = store.mediaRecord(decodeURIComponent(mediaMatch[1]), mediaMatch[2]);
      const file = record && licensedMediaFile(config.licensedMediaDirectory, record.path);
      return file
        ? send(res, 200, readFileSync(file), mediaType(file), { 'cache-control': 'private, max-age=86400' })
        : json(res, 404, { error: 'Licensed exercise media is not configured.' });
    }

    if (!['GET', 'HEAD'].includes(req.method) && !auth.validMutation(req, session)) {
      return json(res, 403, { error: 'Refresh the page and try again.' });
    }
    if (req.method === 'PUT' && path === '/api/plan') {
      return json(res, 200, { plan: store.savePlan(await readBody(req)) });
    }
    if (req.method === 'POST' && path === '/api/exercises/custom') {
      return json(res, 201, { exercise: store.createCustomExercise(normalizeCustomExercise(await readBody(req))) });
    }
    if (req.method === 'POST' && path === '/api/sessions') {
      const body = await readBody(req);
      return json(res, 201, { session: store.startSession(body.planId, today) });
    }
    const setMatch = path.match(/^\/api\/sessions\/([0-9a-f-]+)\/exercises\/([0-9a-f-]+)\/sets$/i);
    if (req.method === 'POST' && setMatch) {
      await readBody(req);
      return json(res, 201, { session: store.addSessionSet(setMatch[1], setMatch[2]) });
    }
    if (req.method === 'PATCH' && setMatch) {
      return json(res, 200, { session: store.updateSet(setMatch[1], setMatch[2], await readBody(req), today) });
    }
    const extraSetMatch = path.match(/^\/api\/sessions\/([0-9a-f-]+)\/exercises\/([0-9a-f-]+)\/sets\/(\d+)$/i);
    if (req.method === 'DELETE' && extraSetMatch) {
      await readBody(req);
      return json(res, 200, { session: store.removeExtraSessionSet(extraSetMatch[1], extraSetMatch[2], extraSetMatch[3]) });
    }
    const finishMatch = path.match(/^\/api\/sessions\/([0-9a-f-]+)\/finish$/i);
    if (req.method === 'POST' && finishMatch) {
      await readBody(req);
      return json(res, 200, { session: store.completeSession(finishMatch[1]) });
    }
    const cancelMatch = path.match(/^\/api\/sessions\/([0-9a-f-]+)$/i);
    if (req.method === 'DELETE' && cancelMatch) {
      await readBody(req);
      store.cancelSession(cancelMatch[1]);
      return json(res, 200, { cancelled: true });
    }
    const progressionMatch = path.match(/^\/api\/progression\/([0-9a-f-]+)$/i);
    if (req.method === 'PATCH' && progressionMatch) {
      const body = await readBody(req);
      return json(res, 200, { session: store.decideProgression(progressionMatch[1], body.decision) });
    }
    if (req.method === 'PUT' && path === '/api/body-weight') {
      const body = await readBody(req);
      return json(res, 200, { weights: store.saveBodyWeight(body.date ?? today, body.grams) });
    }
    if (req.method === 'DELETE' && path === '/api/body-weight') {
      const body = await readBody(req);
      return json(res, 200, { weights: store.deleteBodyWeight(body.date) });
    }
    return json(res, 404, { error: 'Not found.' });
  }

  const server = createServer((req, res) => {
    handle(req, res).catch((error) => {
      if ((error.statusCode ?? 500) >= 500) console.error(error);
      if (!res.headersSent) json(res, error.statusCode ?? 500, { error: error.statusCode ? error.message : 'The gym encountered an error.' });
      else res.end();
    });
  });
  return { server, store };
}

async function main() {
  const configPath = process.env.GYM_CONFIG ?? '/home/ct/.config/personal-gym/config.json';
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  const app = createGymApp(config);
  app.server.listen(config.port, config.host, () => console.log(`Personal gym listening on http://${config.host}:${config.port}${config.mountPath}`));
  let closing = false;
  const close = () => {
    if (closing) return;
    closing = true;
    app.server.close(() => { app.store.close(); process.exit(0); });
    setTimeout(() => process.exit(1), 12_000).unref();
  };
  process.on('SIGINT', close);
  process.on('SIGTERM', close);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
