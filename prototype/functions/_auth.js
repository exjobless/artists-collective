// Web-access auth for the artist studio — website-side, no wallet/key needed.
//
// Trust model (interim / hackathon-grade): an artist gets a one-time 6-digit
// web-access code on /join (the page the dApp redirects to right after their
// on-chain ENROL). They log in on a computer at /login with username + code,
// which mints a signed session cookie. Editing happens at /studio.
//
// SECURE upgrade path (future): issue the code FROM the dApp (a small in-app
// PR) so it inherits the on-chain identity instead of a URL param, or move to
// signature login (option A). See project-status.md "Decisions to be made".
//
// Helper module (underscore prefix => Pages does NOT route it).

const enc = new TextEncoder();

export async function sha256hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

const b64url = (bytes) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlToStr = (s) =>
  atob(s.replace(/-/g, '+').replace(/_/g, '/'));

async function hmacHex(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// Stateless signed token: base64url(json).hmac — no sessions table needed.
export async function signToken(payload, secret) {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  return body + '.' + await hmacHex(secret, body);
}
export async function verifyToken(token, secret) {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  if (sig !== await hmacHex(secret, body)) return null;
  try {
    const payload = JSON.parse(b64urlToStr(body));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch { return null; }
}

export function getCookie(request, name) {
  const m = (request.headers.get('cookie') || '').match(new RegExp('(?:^|; )' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}
export const sessionCookie = (token, maxAge = 60 * 60 * 24 * 14) =>
  `acg_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
export const clearCookie = 'acg_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';

// 6-digit numeric — easy to read off the phone and type on a laptop.
export function genCode() {
  return String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');
}

// Resolve the signing secret. SESSION_SECRET is a Pages secret (set in prod);
// the dev fallback only ever runs locally where there's nothing real to protect.
export const secretOf = (env) => (env && env.SESSION_SECRET) || 'dev-insecure-secret';

// Read the current session from the request cookie, or null.
export async function getSession(request, env) {
  const token = getCookie(request, 'acg_session');
  return token ? verifyToken(token, secretOf(env)) : null;
}
