// GET  /studio          -> authed gallery editor for the logged-in artist.
// POST /studio          -> save one work (title/price/image, incl. file upload),
//                          OR (kind=avatar) replace the artist's profile picture.
// Auth = the signed session cookie minted by /login. No wallet needed here;
// the wall is the web-access code. Edits write straight to D1 -> the public
// gallery (/api/artists) reflects them on next load. Uploaded files go to R2
// (env.UPLOADS) and are served back via /u/<key>.
import { getSession } from "./_auth.js";
import { shell } from "./login.js";
import { IMAGES } from "./_pool.js";

const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const POOL = Object.entries(IMAGES).flatMap(([cat, arr]) => arr.map(img => ({ cat, img })));

// --- uploads ---------------------------------------------------------------
const OK_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
const MAX_BYTES = 15 * 1024 * 1024;                       // generous; few users
const shortOf = (addr) => String(addr).replace(/[^a-z0-9]/gi, '').slice(0, 10) || 'artist';

// Store one uploaded File in R2, return {path} (a "u/<key>" value to save in D1)
// or {error} for a bad file, or null when no file was provided.
async function storeUpload(env, file, addr) {
  if (!file || typeof file === 'string' || !file.size) return null;
  const ext = OK_TYPES[file.type];
  if (!ext) return { error: 'Use a JPG, PNG, WebP or GIF image.' };
  if (file.size > MAX_BYTES) return { error: 'Image is too large (max 15 MB).' };
  const key = `${shortOf(addr)}/${crypto.randomUUID()}.${ext}`;
  await env.UPLOADS.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
  return { path: 'u/' + key };
}

export async function onRequestGet({ request, env }) {
  const sess = await getSession(request, env);
  if (!sess) return new Response(null, { status: 302, headers: { 'Location': '/login' } });
  if (!env || !env.DB) return shell('Studio', '<main class="studio"><p>Studio temporarily unavailable.</p></main>', 503);

  const artist = await env.DB.prepare('SELECT portrait FROM artists WHERE address = ?').bind(sess.addr).first();
  const works = (await env.DB
    .prepare('SELECT id, img, cat, title, size, medium, price FROM artworks WHERE artist_address = ? ORDER BY id')
    .bind(sess.addr).all()).results || [];

  const url = new URL(request.url);
  return shell(`Studio — ${esc(sess.handle)}`, body(sess, artist, works, {
    saved: url.searchParams.get('saved'),
    err: url.searchParams.get('err'),
  }));
}

export async function onRequestPost({ request, env }) {
  const sess = await getSession(request, env);
  if (!sess) return new Response('unauthorized', { status: 401 });
  if (!env || !env.DB) return redirect('/studio?err=' + enc('Studio temporarily unavailable.'));

  const form = await request.formData();
  const kind = (form.get('kind') || 'work').toString();

  // --- profile picture ---
  if (kind === 'avatar') {
    if (!env.UPLOADS) return redirect('/studio?err=' + enc('Image storage unavailable.'));
    const up = await storeUpload(env, form.get('avatar'), sess.addr);
    if (!up) return redirect('/studio?err=' + enc('Choose an image first.'));
    if (up.error) return redirect('/studio?err=' + enc(up.error));
    await env.DB.prepare('UPDATE artists SET portrait = ? WHERE address = ?').bind(up.path, sess.addr).run();
    return redirect('/studio?saved=avatar');
  }

  // --- one artwork ---
  const id = (form.get('id') || '').toString();
  const own = await env.DB.prepare('SELECT id, img FROM artworks WHERE id = ? AND artist_address = ?')
    .bind(id, sess.addr).first();
  if (!own) return new Response('not found', { status: 404 });

  const title = (form.get('title') || '').toString().trim().slice(0, 80) || 'Untitled';
  const price = Math.max(0, parseInt((form.get('price') || '0').toString(), 10) || 0);

  // Image precedence: a freshly uploaded file wins; else the dropdown pick (if a
  // known pool image); else keep the current image (covers an existing upload).
  let img = own.img;
  const up = await storeUpload(env, form.get('imgfile'), sess.addr);
  if (up && up.error) return redirect('/studio?err=' + enc(up.error));
  if (up && up.path) {
    img = up.path;
  } else {
    const picked = (form.get('img') || '').toString().trim();
    if (picked === own.img || POOL.some(p => p.img === picked)) img = picked;
  }

  await env.DB.prepare('UPDATE artworks SET title = ?, price = ?, img = ? WHERE id = ? AND artist_address = ?')
    .bind(title, price, img, id, sess.addr).run();

  return redirect('/studio?saved=' + enc(id));
}

const enc = encodeURIComponent;
const redirect = (loc) => new Response(null, { status: 303, headers: { 'Location': loc } });

function body(sess, artist, works, flags) {
  const portrait = (artist && artist.portrait) || 'gen/portrait_young/artist_0.jpg';
  const avatarSaved = flags.saved === 'avatar' ? '<span class="saved">updated ✓</span>' : '';
  const errBanner = flags.err ? `<div class="errbar">${esc(flags.err)}</div>` : '';

  const cards = works.map(w => {
    const isUploaded = String(w.img).startsWith('u/');
    const keepOpt = isUploaded
      ? `<option value="${esc(w.img)}" selected>★ your uploaded image</option>` : '';
    const opts = keepOpt + POOL.map(p =>
      `<option value="${esc(p.img)}"${p.img === w.img ? ' selected' : ''}>${esc(p.cat)} · ${esc(p.img.split('/').pop())}</option>`
    ).join('');
    const saved = (flags.saved && flags.saved === String(w.id)) ? '<span class="saved">saved ✓</span>' : '';
    return `
    <form method="POST" action="/studio" enctype="multipart/form-data" class="work">
      <div class="frame"><img src="/${esc(w.img)}" alt=""></div>
      <input type="hidden" name="id" value="${esc(w.id)}">
      <label>Title<input name="title" value="${esc(w.title)}" maxlength="80"></label>
      <label>Price (USD)<input name="price" type="number" min="0" step="50" value="${esc(w.price)}"></label>
      <label>Choose from the set<select name="img">${opts}</select></label>
      <label class="up">Or upload your own<input name="imgfile" type="file" accept="image/jpeg,image/png,image/webp,image/gif"></label>
      <div class="row"><button type="submit">Save</button>${saved}</div>
    </form>`;
  }).join('');

  return `
  <main class="studio">
    <div class="shead">
      <div><a class="back" href="/">← The Artists’ Collective</a>
        <h1 class="serif">Your studio</h1>
        <p class="sub">Signed in as <strong>${esc(sess.handle)}</strong>. Edit a work and hit Save — it updates the public gallery.</p>
      </div>
      <a class="logout" href="/logout">Sign out</a>
    </div>

    ${errBanner}

    <section class="avatar-card">
      <div class="frame av"><img src="/${esc(portrait)}" alt=""></div>
      <form method="POST" action="/studio" enctype="multipart/form-data" class="avatar-form">
        <input type="hidden" name="kind" value="avatar">
        <div>
          <h2 class="serif">Profile picture</h2>
          <p class="sub">Upload any image to use as your artist portrait.</p>
          <label class="up"><input name="avatar" type="file" accept="image/jpeg,image/png,image/webp,image/gif"></label>
        </div>
        <div class="row"><button type="submit">Update</button>${avatarSaved}</div>
      </form>
    </section>

    ${works.length ? `<div class="wgrid">${cards}</div>`
      : `<p class="muted">No works on file for this account yet.</p>`}
    <p class="muted small note">Your changes appear in the public gallery and on your artist page automatically — you can close this tab when you’re done.</p>
  </main>
  <style>
    .shead{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}
    .logout{color:var(--mut);text-decoration:none;font-size:14px;border:1px solid var(--line);padding:7px 12px;border-radius:7px;white-space:nowrap}
    .logout:hover{color:var(--ink);border-color:var(--mut)}
    .errbar{background:#5a1d1d;color:#ffd9d9;border:1px solid #7a2a2a;border-radius:8px;padding:10px 14px;margin:18px 0;font-size:14px}
    .avatar-card{display:flex;gap:20px;align-items:center;margin-top:24px;padding:16px;background:var(--panel);border:1px solid var(--line);border-radius:10px;flex-wrap:wrap}
    .avatar-card .frame.av{background:var(--mat);padding:8px;border-radius:50%;width:96px;height:96px;flex:0 0 auto}
    .avatar-card .frame.av img{width:80px;height:80px;object-fit:cover;border-radius:50%;display:block}
    .avatar-form{display:flex;gap:18px;align-items:center;justify-content:space-between;flex:1;min-width:280px;flex-wrap:wrap}
    .avatar-form h2{margin:0 0 2px}
    .wgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:20px;margin-top:24px}
    .work{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:12px}
    .work .frame{background:var(--mat);padding:8px;border-radius:4px;aspect-ratio:4/5;overflow:hidden;display:grid;place-items:center}
    .work .frame img{width:100%;height:100%;object-fit:cover;display:block;border-radius:2px}
    .work label,.avatar-form label{display:flex;flex-direction:column;gap:4px;font-size:13px;color:var(--mut)}
    .work label.up,.avatar-form label.up{font-size:12px}
    .work input,.work select{font:inherit}
    input[type=file]{font-size:12px;color:var(--mut)}
    .work .row{display:flex;align-items:center;gap:12px}
    .saved{color:#7bbf86;font-size:13px}
    .note{margin-top:30px;max-width:60ch}
  </style>`;
}
