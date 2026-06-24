// GET  /login  -> username + web-access-code form.
// POST /login  -> verify against artists.code_hash, mint session cookie -> /studio.
import { sha256hex, signToken, sessionCookie, getSession } from "./_auth.js";

const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export async function onRequestGet({ request, env }) {
  if (await getSession(request, env)) return redirect('/studio');
  // Magic link: /login?u=<username>&code=<code> auto-signs-in when opened in a
  // real browser. The dApp copies this so a phone artist pastes ONE thing into
  // Safari/Chrome (the in-app webview can't upload files, so we hand them out).
  const url = new URL(request.url);
  const u = (url.searchParams.get('u') || '').trim();
  const c = (url.searchParams.get('code') || '').trim();
  if (u && c && env && env.DB) {
    const artist = await matchHandleCode(env, u, c);
    if (artist) {
      const token = await signToken(
        { addr: artist.address, handle: artist.handle, exp: Date.now() + 14 * 864e5 },
        (env.SESSION_SECRET) || 'dev-insecure-secret'
      );
      return new Response(null, { status: 303, headers: { 'Location': '/studio', 'Set-Cookie': sessionCookie(token) } });
    }
    return loginPage('That sign-in link is expired — get a fresh one from the dApp, or enter your code below.', 401, u);
  }
  return loginPage('', 200);
}

export async function onRequestPost({ request, env }) {
  const form = await request.formData();
  const handle = (form.get('username') || '').trim();
  const code = (form.get('code') || '').trim();
  if (!handle || !code) return loginPage('Enter your username and code.', 400);
  if (!env || !env.DB) return loginPage('Login is temporarily unavailable.', 503);

  const rows = (await env.DB
    .prepare('SELECT address FROM artists WHERE handle = ?').bind(handle).all()).results || [];
  if (!rows.length) return loginPage('Unknown username, or no web access set for it.', 401);
  const artist = await matchHandleCode(env, handle, code);
  if (!artist) return loginPage('That code is not right.', 401);

  const token = await signToken(
    { addr: artist.address, handle: artist.handle, exp: Date.now() + 14 * 864e5 },
    (env.SESSION_SECRET) || 'dev-insecure-secret'
  );
  return new Response(null, { status: 303, headers: { 'Location': '/studio', 'Set-Cookie': sessionCookie(token) } });
}

const redirect = (to) => new Response(null, { status: 303, headers: { 'Location': to } });

// Duplicate handles exist (rows are keyed by wallet address, and demo mode +
// re-enrols create same-name rows, some without a code). The code uniquely
// identifies the right artist, so match it against EVERY row with that handle
// rather than just the first — otherwise a codeless demo row shadows the real one.
async function matchHandleCode(env, handle, code) {
  const hash = await sha256hex(code);
  const rows = (await env.DB
    .prepare('SELECT address, handle, code_hash FROM artists WHERE handle = ?')
    .bind(handle).all()).results || [];
  return rows.find(r => r.code_hash && r.code_hash === hash) || null;
}

function loginPage(msg, status, prefill = '') {
  const err = msg ? `<p class="err">${esc(msg)}</p>` : '';
  return shell('Sign in — The Artists’ Collective', `
  <main class="auth">
    <a class="back" href="/">← The Artists’ Collective</a>
    <h1 class="serif">Manage your gallery</h1>
    <p class="sub">Sign in to edit your works from a computer. Your username and web-access code were shown when you created your artist account.</p>
    ${err}
    <form method="POST" action="/login" class="card">
      <label>Username<input name="username" value="${esc(prefill)}" autocomplete="username" autocapitalize="none" spellcheck="false" required></label>
      <label>Web-access code<input name="code" inputmode="numeric" autocomplete="one-time-code" placeholder="6 digits" required></label>
      <button type="submit">Sign in</button>
    </form>
    <p class="muted small">Lost your code? Re-create your artist account from the dApp to get a new one (until in-app reset ships).</p>
  </main>`, status);
}

// In-app-webview escape hatch. The Usernode phone app opens links in its own
// embedded webview, where <input type=file> never opens a picker — so uploads
// silently fail. We can't force the picker open from web code, so we surface a
// "open in your real browser" bar (copies the /login URL) on phones / in-app
// browsers. Desktop never sees it. The bar is dismissible.
const BROWSER_BAR = `
<div id="iawbar" hidden>
  <span>📱 On a phone? If an upload button won’t open, open this page in your browser (Safari/Chrome) and sign in there.</span>
  <button type="button" id="iawcopy">Copy link</button>
  <button type="button" id="iawx" aria-label="Dismiss">✕</button>
</div>
<script>
(function(){try{
  var u=(navigator.userAgent||"").toLowerCase();
  var inApp = u.indexOf("; wv)")>-1||u.indexOf("fban")>-1||u.indexOf("fbav")>-1||u.indexOf("instagram")>-1||u.indexOf("line/")>-1||u.indexOf("usernode")>-1||((u.indexOf("iphone")>-1||u.indexOf("ipad")>-1)&&u.indexOf("safari")<0);
  var touch=(window.matchMedia&&matchMedia("(pointer:coarse)").matches)||("ontouchstart" in window);
  if(!(inApp||touch))return;
  var bar=document.getElementById("iawbar");if(!bar)return;bar.hidden=false;
  var link=location.origin+"/login";
  var copy=document.getElementById("iawcopy");
  function done(){copy.textContent="Copied \\u2713";setTimeout(function(){copy.textContent="Copy link"},1600);}
  function fallback(){var t=document.createElement("textarea");t.value=link;document.body.appendChild(t);t.select();try{document.execCommand("copy");done();}catch(e){prompt("Copy this link:",link);}document.body.removeChild(t);}
  copy.addEventListener("click",function(){if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(link).then(done,fallback);}else{fallback();}});
  document.getElementById("iawx").addEventListener("click",function(){bar.hidden=true;});
}catch(e){}})();
</script>`;

// Shared dark-palette shell, matching the /join profile look.
export function shell(title, body, status = 200) {
  return new Response(`<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600&family=Hanken+Grotesk:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root{--bg:#13110e;--panel:#1b1814;--ink:#ece6db;--mut:#a89f8f;--acc:#c98a4b;--mat:#f4efe6;--line:#2c271f}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:'Hanken Grotesk',system-ui,sans-serif;line-height:1.5}
.serif{font-family:'Cormorant Garamond',serif;font-weight:600}
.auth,.studio{max-width:1040px;margin:0 auto;padding:28px 22px 80px}
.auth{max-width:460px}
.back{color:var(--mut);text-decoration:none;font-size:14px}.back:hover{color:var(--ink)}
h1.serif{font-size:34px;margin:22px 0 6px}.sub{color:var(--mut);margin:0 0 22px}
.muted{color:var(--mut)}.small{font-size:13px}
.err{background:rgba(201,90,75,.14);color:#e0a08f;border:1px solid rgba(201,90,75,.4);padding:9px 12px;border-radius:8px;margin:0 0 16px;font-size:14px}
.ok{background:rgba(123,191,134,.12);color:#7bbf86;border:1px solid rgba(123,191,134,.35);padding:9px 12px;border-radius:8px;margin:0 0 16px;font-size:14px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:20px;display:flex;flex-direction:column;gap:14px}
label{display:flex;flex-direction:column;gap:6px;font-size:13px;color:var(--mut)}
input,select{background:#0f0d0b;border:1px solid var(--line);border-radius:7px;color:var(--ink);padding:10px 12px;font-size:15px;font-family:inherit}
input:focus,select:focus{outline:none;border-color:var(--acc)}
button{background:var(--acc);color:#1a140d;border:0;border-radius:7px;padding:11px 14px;font-size:15px;font-weight:600;cursor:pointer}
button:hover{filter:brightness(1.06)}
#iawbar{position:sticky;top:0;z-index:50;display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:#2a2118;border-bottom:1px solid var(--line);padding:9px 14px;font-size:13.5px}
#iawbar span{flex:1;min-width:180px;color:var(--mut)}
#iawbar button{padding:6px 10px;font-size:13px;border-radius:6px}
#iawbar #iawx{background:transparent;color:var(--mut);font-weight:400;padding:6px 8px}
</style></head><body>${BROWSER_BAR}${body}</body></html>`,
    { status, headers: { 'content-type': 'text/html;charset=utf-8' } });
}
