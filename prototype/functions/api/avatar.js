// POST /api/avatar  — set an artist's profile picture FROM the dApp.
// The dApp's server.js forwards the image here (server-side) so the website is
// the single source of truth for the portrait, keyed by wallet address. The
// website /studio and this endpoint both write artists.portrait, so whatever is
// uploaded on either surface shows on BOTH (the dApp reads portrait from
// /api/artist). Auth = the shared WEB_ACCESS_KEY (same secret PR13 uses).
//
// Auth:   Authorization: Bearer <WEB_ACCESS_KEY>
// Body:   { address, content_type, image_base64, username? }
// Returns:{ ok, portrait, portrait_url }
import { makeProfile } from "../_pool.js";

const OK = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
const MAX = 15 * 1024 * 1024;
const json = (o, s = 200) => new Response(JSON.stringify(o), {
  status: s, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': '*' },
});

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'POST,OPTIONS',
    'access-control-allow-headers': 'authorization,content-type',
  } });
}

export async function onRequestPost({ request, env }) {
  const key = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!env.WEB_ACCESS_KEY || key !== env.WEB_ACCESS_KEY) return json({ ok: false, error: 'unauthorized' }, 401);
  if (!env.UPLOADS) return json({ ok: false, error: 'storage unavailable' }, 503);
  if (!env.DB) return json({ ok: false, error: 'database unavailable' }, 503);

  let data;
  try { data = await request.json(); } catch { return json({ ok: false, error: 'invalid json' }, 400); }
  const address = (data.address || '').trim();
  const ct = (data.content_type || '').trim().toLowerCase();
  const b64 = (data.image_base64 || '').trim();
  if (!address) return json({ ok: false, error: 'address required' }, 400);
  const ext = OK[ct];
  if (!ext) return json({ ok: false, error: 'unsupported image type (jpg/png/webp/gif)' }, 400);

  // decode base64 (tolerate a data: URL prefix)
  const raw = b64.includes(',') ? b64.slice(b64.indexOf(',') + 1) : b64;
  let bytes;
  try {
    const bin = atob(raw);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } catch { return json({ ok: false, error: 'bad base64' }, 400); }
  if (!bytes.length) return json({ ok: false, error: 'empty image' }, 400);
  if (bytes.length > MAX) return json({ ok: false, error: 'image too large (max 15 MB)' }, 400);

  const short = address.replace(/[^a-z0-9]/gi, '').slice(0, 10) || 'artist';
  const okey = `${short}/avatar-${crypto.randomUUID()}.${ext}`;
  await env.UPLOADS.put(okey, bytes, { httpMetadata: { contentType: ct } });
  const portrait = 'u/' + okey;

  const exists = await env.DB.prepare("SELECT address FROM artists WHERE address=?").bind(address).first();
  if (exists) {
    await env.DB.prepare("UPDATE artists SET portrait=? WHERE address=?").bind(portrait, address).run();
  } else {
    // New artist enrolling straight from the dApp — mint a profile, override portrait.
    const p = makeProfile(address, (data.username || '').trim());
    const now = Date.now();
    const stmts = [
      env.DB.prepare("INSERT INTO artists(address,handle,bio,loc,portrait,code_hash,created_at) VALUES(?,?,?,?,?,?,?)")
        .bind(p.address, p.handle, p.bio, p.loc, portrait, null, now),
    ];
    for (const w of p.works)
      stmts.push(env.DB.prepare("INSERT INTO artworks(id,artist_address,img,cat,title,size,medium,price,created_at) VALUES(?,?,?,?,?,?,?,?,?)")
        .bind(w.id, p.address, w.img, w.cat, w.title, w.size, w.medium, w.price, now));
    await env.DB.batch(stmts);
  }

  const origin = new URL(request.url).origin;
  return json({ ok: true, portrait, portrait_url: origin + '/' + portrait });
}
