// GET /join?addr=<wallet>&name=<username>
// The dApp hands the artist over here right after the on-chain ENROL tx.
// Renders the artist's ready-made profile (deterministic from the address).
// Best-effort persists to D1 so the gallery + bot can see them; renders fine
// even if D1 isn't bound yet.
import { makeProfile } from "./_pool.js";
import { genCode, sha256hex } from "./_auth.js";

const esc = (s) => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const usd = (n) => '$' + Number(n).toLocaleString('en-US');

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const addr = (url.searchParams.get('addr') || '').trim();
  const name = (url.searchParams.get('name') || '').trim();
  // dApp P16 (#20) now passes &gender=male|female|na — used only to pick a
  // matching portrait. Optional: older links without it fall back to all portraits.
  const gender = (url.searchParams.get('gender') || '').trim();
  if (!addr) return page(errorBody("No wallet address — open this from the dApp's “Create your artist account”."), 400);

  const prof = makeProfile(addr, name, gender);

  // Best-effort persist (gallery list + bot sales). Never blocks the render.
  // First creation returns a one-time web-access code (to edit the gallery on a
  // computer — see /login); null if the artist already existed.
  let webCode = null;
  // Skip demo addresses (ut1demo… from /?demo= flows) so demo mode never writes
  // junk artists into the public gallery. Render the profile, just don't persist.
  if (env && env.DB && !/^ut1demo/i.test(addr)) {
    try { webCode = await persist(env.DB, prof); } catch (e) { /* D1 not ready yet — render anyway */ }
  }

  return page(profileBody(prof, webCode), 200);
}

// Persists a new artist + works + seeded sales, and mints a one-time web-access
// code (stored hashed). Returns the plaintext code on creation (shown once on
// the page), or null if the artist already existed.
async function persist(DB, p) {
  const now = Date.now();
  const exists = await DB.prepare("SELECT address FROM artists WHERE address=?").bind(p.address).first();
  if (exists) return null;
  const code = genCode();
  const code_hash = await sha256hex(code);
  const stmts = [
    DB.prepare("INSERT INTO artists(address,handle,bio,loc,portrait,code_hash,created_at) VALUES(?,?,?,?,?,?,?)")
      .bind(p.address, p.handle, p.bio, p.loc, p.portrait, code_hash, now),
  ];
  for (const w of p.works)
    stmts.push(DB.prepare("INSERT INTO artworks(id,artist_address,img,cat,title,size,medium,price,created_at) VALUES(?,?,?,?,?,?,?,?,?)")
      .bind(w.id, p.address, w.img, w.cat, w.title, w.size, w.medium, w.price, now));
  for (const s of p.sales)
    stmts.push(DB.prepare("INSERT INTO sales(id,artist_address,artwork_id,buyer,price,tx_id,created_at) VALUES(?,?,?,?,?,?,?)")
      .bind(s.id, p.address, s.artwork_id, s.buyer, s.price, null, now));
  await DB.batch(stmts);
  return code;
}

function profileBody(p, webCode) {
  const codePanel = webCode ? `
    <div class="webcode">
      <strong>Your web-access code: <code class="codeval">${esc(webCode)}</code></strong>
      <p class="muted small">Save this. To edit your gallery from a computer, go to <a href="/login">/login</a> and sign in with your username (<code>${esc(p.handle)}</code>) and this code. It’s shown only once.</p>
    </div>` : '';
  const works = p.works.map(w => `
    <figure class="work">
      <div class="frame"><img src="/${esc(w.img)}" alt="${esc(w.title)}" loading="lazy"></div>
      <figcaption><em>${esc(w.title)}</em><span class="meta">${esc(w.cat)} · ${esc(w.size)} · ${esc(w.medium)}</span><span class="price">${usd(w.price)}</span></figcaption>
    </figure>`).join('');
  const sales = p.sales.map(s => `<li><span><em>${esc(s.title)}</em> · ${esc(s.buyer)}</span><span class="price">${usd(s.price)}</span></li>`).join('');
  return `
  <main class="profile">
    <a class="back" href="/">← The Artists' Collective</a>
    <header class="phead">
      <div class="avatar"><img src="/${esc(p.portrait)}" alt="${esc(p.handle)}"></div>
      <div>
        <h1 class="serif">${esc(p.handle)}</h1>
        <p class="loc">${esc(p.loc)}</p>
        <p class="badge">✓ Verified on-chain — registered to <code>${esc(p.address.slice(0,10))}…${esc(p.address.slice(-4))}</code></p>
        <p class="bio">${esc(p.bio)}</p>
      </div>
    </header>

    <section>
      <h2 class="serif">Your works <span class="muted">· ${p.works.length}</span></h2>
      <div class="grid">${works}</div>
    </section>

    <section>
      <h2 class="serif">Your sales <span class="muted">· verified on-chain</span></h2>
      <ul class="sales">${sales}</ul>
      <p class="muted small">More sales arrive as collectors buy — watch them appear in your studio.</p>
    </section>

    ${codePanel}

    <p class="cta">You're set up. Head back to the dApp and tap <strong>“Enter the studio”</strong> to manage your gallery and vote.</p>
  </main>`;
}

function errorBody(msg) {
  return `<main class="profile"><a class="back" href="/">← The Artists' Collective</a>
    <header class="phead"><div><h1 class="serif">Something's missing</h1><p class="bio">${esc(msg)}</p></div></header></main>`;
}

function page(body, status) {
  return new Response(`<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>The Artists' Collective — your profile</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Hanken+Grotesk:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root{--bg:#13110e;--panel:#1b1814;--ink:#ece6db;--mut:#a89f8f;--acc:#c98a4b;--mat:#f4efe6;--line:#2c271f}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:'Hanken Grotesk',system-ui,sans-serif;line-height:1.5}
.serif{font-family:'Cormorant Garamond',serif;font-weight:600;letter-spacing:.2px}
.profile{max-width:1040px;margin:0 auto;padding:28px 22px 80px}
.back{color:var(--mut);text-decoration:none;font-size:14px}.back:hover{color:var(--ink)}
.phead{display:flex;gap:22px;align-items:flex-start;margin:26px 0 36px}
.avatar{width:96px;height:96px;border-radius:50%;overflow:hidden;flex:0 0 auto;background:var(--panel)}
.avatar img{width:100%;height:100%;object-fit:cover}
h1.serif{font-size:40px;margin:0 0 2px}h2.serif{font-size:26px;margin:34px 0 16px}
.loc{color:var(--mut);margin:0 0 10px}
.badge{display:inline-block;background:rgba(201,138,75,.12);color:var(--acc);border:1px solid rgba(201,138,75,.35);padding:4px 10px;border-radius:999px;font-size:13px;margin:0 0 10px}
.badge code{font-family:ui-monospace,monospace;color:var(--acc)}
.bio{max-width:60ch;color:var(--ink);margin:0}
.muted{color:var(--mut)}.small{font-size:13px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:22px}
.work .frame{background:var(--mat);padding:14px;border-radius:4px}
.work img{width:100%;height:auto;display:block;border-radius:2px}
.work figcaption{display:flex;flex-direction:column;gap:2px;padding:10px 2px 0}
.work .meta{color:var(--mut);font-size:12.5px}.work .price{color:var(--acc);font-weight:600;margin-top:2px}
.sales{list-style:none;padding:0;margin:0;max-width:620px}
.sales li{display:flex;justify-content:space-between;gap:14px;padding:11px 0;border-bottom:1px solid var(--line)}
.sales .price{color:#7bbf86;font-weight:600}
.webcode{margin-top:34px;padding:16px 18px;background:rgba(201,138,75,.10);border:1px solid rgba(201,138,75,.4);border-radius:8px;max-width:620px}
.webcode .codeval{font-family:ui-monospace,monospace;font-size:20px;letter-spacing:3px;color:var(--acc)}
.webcode p{margin:8px 0 0}.webcode a{color:var(--acc)}
.cta{margin-top:24px;padding:16px 18px;background:var(--panel);border:1px solid var(--line);border-radius:8px;max-width:620px}
@media(max-width:560px){.phead{flex-direction:column;gap:14px}h1.serif{font-size:32px}}
</style></head><body>${body}</body></html>`,
    { status, headers: { 'content-type': 'text/html;charset=utf-8' } });
}
