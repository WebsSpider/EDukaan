const COOKIE_NAME = 'edukan_dash_session';
/** Set by wrangler secret `SESSION_SECRET` — use a long random string. */
const SESSION_VERSION = '1';

/**
 * Prefer dedicated `SESSION_SECRET`. If unset (common mistake), fall back to
 * `DASHBOARD_PASSWORD` so login works with a single secret — less ideal but
 * avoids empty HMAC key crashes.
 */
export function resolveSessionSecret(env: {
  SESSION_SECRET?: string;
  DASHBOARD_PASSWORD?: string;
}): string {
  const s = env.SESSION_SECRET?.trim();
  if (s) return s;
  return env.DASHBOARD_PASSWORD?.trim() ?? '';
}

function hexFromBuffer(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hmacHex(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  if (!secret.length) {
    throw new Error(
      'Session signing secret is empty. Set wrangler secret SESSION_SECRET (recommended) or DASHBOARD_PASSWORD.'
    );
  }
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return hexFromBuffer(sig);
}

export async function createSessionValue(secret: string): Promise<string> {
  const exp = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const msg = `${SESSION_VERSION}|${exp}`;
  const mac = await hmacHex(msg, secret);
  return `${msg}|${mac}`;
}

export async function verifySessionValue(
  raw: string | undefined,
  secret: string
): Promise<boolean> {
  if (!raw?.trim()) return false;
  const parts = raw.split('|');
  if (parts.length !== 3 || parts[0] !== SESSION_VERSION) return false;
  const exp = Number(parts[1]);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;
  const msg = `${parts[0]}|${parts[1]}`;
  const mac = await hmacHex(msg, secret);
  if (mac !== parts[2]) return false;
  return true;
}

export function getSessionCookie(req: Request): string | undefined {
  const header = req.headers.get('Cookie');
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === COOKIE_NAME) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

export function setSessionCookie(value: string, secure: boolean): string {
  const maxAge = 7 * 24 * 60 * 60;
  const sec = secure ? '; Secure' : '';
  return `${COOKIE_NAME}=${encodeURIComponent(value)}; SameSite=Lax; Path=/; Max-Age=${maxAge}; HttpOnly${sec}`;
}

export function clearSessionCookie(secure: boolean): string {
  const sec = secure ? '; Secure' : '';
  return `${COOKIE_NAME}=; SameSite=Lax; Path=/; Max-Age=0; HttpOnly${sec}`;
}

export { COOKIE_NAME };
