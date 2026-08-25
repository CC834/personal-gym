import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

function parseCookies(req) {
  return Object.fromEntries(String(req.headers.cookie ?? '').split(';').map((item) => item.trim()).filter(Boolean).map((item) => {
    const at = item.indexOf('=');
    return [item.slice(0, at), decodeURIComponent(item.slice(at + 1))];
  }));
}

function secureEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
}

export class GymAuth {
  constructor({ secretPath, allowedLogin, allowedOrigin, cookieSecure = true, mountPath = '/gym' }) {
    mkdirSync(dirname(secretPath), { recursive: true, mode: 0o700 });
    if (!existsSync(secretPath)) writeFileSync(secretPath, randomBytes(32).toString('hex'), { mode: 0o600, flag: 'wx' });
    chmodSync(secretPath, 0o600);
    this.secret = readFileSync(secretPath, 'utf8').trim();
    this.allowedLogin = allowedLogin;
    this.allowedOrigin = allowedOrigin;
    this.cookieSecure = cookieSecure;
    this.mountPath = mountPath;
  }

  sign(value) {
    return createHmac('sha256', this.secret).update(value).digest('base64url');
  }

  session(req, res) {
    const login = String(req.headers['tailscale-user-login'] ?? '');
    if (login !== this.allowedLogin) return null;
    const existing = parseCookies(req).gym_session;
    if (existing) {
      const [payload, signature] = existing.split('.');
      if (payload && signature && secureEqual(this.sign(payload), signature)) {
        try {
          const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
          if (session.login === login && session.expires > Date.now()) return { ...session, csrf: this.sign(`csrf:${session.id}:${login}`) };
        } catch {}
      }
    }
    const session = { id: randomBytes(18).toString('base64url'), login, expires: Date.now() + 12 * 60 * 60 * 1000 };
    const payload = Buffer.from(JSON.stringify(session)).toString('base64url');
    const secure = this.cookieSecure ? '; Secure' : '';
    res.setHeader('set-cookie', `gym_session=${encodeURIComponent(`${payload}.${this.sign(payload)}`)}; Path=${this.mountPath}; Max-Age=43200${secure}; HttpOnly; SameSite=Strict`);
    return { ...session, csrf: this.sign(`csrf:${session.id}:${login}`) };
  }

  validMutation(req, session) {
    const contentType = String(req.headers['content-type'] ?? '').toLowerCase().split(';')[0];
    return req.headers.origin === this.allowedOrigin && contentType === 'application/json' && secureEqual(req.headers['x-csrf-token'] ?? '', session.csrf);
  }
}
