// POST /api/web-access  — the dApp calls this to mint a desktop web-access code
// for the logged-in artist. The dApp knows the real node holder (via
// getNodeAddress()), so it vouches for the address; the shared bearer key
// proves the call came from OUR dApp (not a random client).
//
// Auth:    Authorization: Bearer <WEB_ACCESS_KEY>   (Pages secret == dApp secret)
// Body:    { "address": "ut1...", "username": "exjobless" }
// Returns: { ok, code, username, login_url }   — dApp shows code + link to artist.
//
// Effect: upserts the artist (creates their gallery if new, same as /join) and
// sets artists.code_hash = sha256(code). The artist then signs in at /login.
import { makeProfile } from "../_pool.js";
import { genCode, sha256hex } from "../_auth.js";

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export async function onRequestPost({ request, env }) {
  const key = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const expected = (env && env.WEB_ACCESS_KEY) || '';
  if (!expected || key !== expected) return json({ ok: false, error: 'unauthorized' }, 401);
  if (!env.DB) return json({ ok: false, error: 'database unavailable' }, 503);

  let data;
  try { data = await request.json(); } catch { return json({ ok: false, error: 'invalid json' }, 400); }
  const address = (data.address || '').trim();
  const username = (data.username || '').trim();
  if (!address) return json({ ok: false, error: 'address required' }, 400);

  // Demo mode (/?demo=…) calls with placeholder ut1demo… addresses — never persist
  // those (they pollute the public gallery). Hand back a throwaway code so the demo
  // UI still shows one, but write nothing to D1.
  if (/^ut1demo/i.test(address)) {
    const origin = new URL(request.url).origin;
    const demoCode = genCode();
    const u = username || 'demo';
    return json({ ok: true, code: demoCode, username: u, login_url: origin + '/login',
      magic_url: `${origin}/login?u=${encodeURIComponent(u)}&code=${encodeURIComponent(demoCode)}`, demo: true });
  }

  const code = genCode();
  const code_hash = await sha256hex(code);
  const now = Date.now();

  const exists = await env.DB.prepare("SELECT address, handle FROM artists WHERE address=?").bind(address).first();
  let handle = username;
  if (exists) {
    // Returning artist — just rotate their code (and refresh username if given).
    handle = username || exists.handle;
    await env.DB.prepare("UPDATE artists SET code_hash=?, handle=? WHERE address=?")
      .bind(code_hash, handle, address).run();
  } else {
    // New artist — mint a full gallery (same shape as /join) so there's work to edit.
    const p = makeProfile(address, username);
    handle = p.handle;
    const stmts = [
      env.DB.prepare("INSERT INTO artists(address,handle,bio,loc,portrait,code_hash,created_at) VALUES(?,?,?,?,?,?,?)")
        .bind(p.address, p.handle, p.bio, p.loc, p.portrait, code_hash, now),
    ];
    for (const w of p.works)
      stmts.push(env.DB.prepare("INSERT INTO artworks(id,artist_address,img,cat,title,size,medium,price,created_at) VALUES(?,?,?,?,?,?,?,?,?)")
        .bind(w.id, p.address, w.img, w.cat, w.title, w.size, w.medium, w.price, now));
    for (const s of p.sales)
      stmts.push(env.DB.prepare("INSERT INTO sales(id,artist_address,artwork_id,buyer,price,tx_id,created_at) VALUES(?,?,?,?,?,?,?)")
        .bind(s.id, p.address, s.artwork_id, s.buyer, s.price, null, now));
    await env.DB.batch(stmts);
  }

  const origin = new URL(request.url).origin;
  const login_url = origin + '/login';
  // One-tap sign-in link: paste into a real browser -> auto-logged-in at /studio.
  const magic_url = `${origin}/login?u=${encodeURIComponent(handle)}&code=${encodeURIComponent(code)}`;
  return json({ ok: true, code, username: handle, login_url, magic_url });
}
