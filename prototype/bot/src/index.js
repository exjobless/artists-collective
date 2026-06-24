// The Artists' Collective — simulated-sales bot (Cloudflare Worker).
//
// Runs itself on Cloudflare's cron (see wrangler.toml) 24/7 — no babysat
// session. Each tick inserts ONE simulated sale into the D1 `sales` table:
// a random dynamic artist (anyone who joined via /join), one of their works,
// and a random buyer persona reused from the website's _pool.js BUYERS — so
// the gallery + /join profiles feel alive.
//
// DB-only for now: tx_id is whatever mintReceipt() returns, currently null.
// MONDAY (Salah's app key): make mintReceipt() sign + submit the receipt and
// return the on-chain tx hash. That is the ONLY change needed — the insert
// already writes the returned value into sales.tx_id. Nothing else moves.

import { BUYERS } from "../../functions/_pool.js";

const pick = (a) => a[Math.floor(Math.random() * a.length)];

// ---- The Monday hook ---------------------------------------------------------
// Today: DB-only, no signing -> no receipt. Returns null so sales.tx_id stays
// NULL (exactly like the seeded sales the website already renders).
// Monday: replace the body with sign + POST to Salah's app-key node RPC, then
// return the resulting tx hash string. Signature stays the same.
async function mintReceipt(env, sale) {
  return null;
}
// -----------------------------------------------------------------------------

async function runTick(env) {
  if (!env || !env.DB) return { ok: false, reason: "no D1 binding" };

  // Only dynamic artists live in D1 (seeded gallery artists are static in the
  // site). Pick one that actually has at least one artwork to sell.
  const artists = (await env.DB.prepare("SELECT address FROM artists").all()).results || [];
  if (!artists.length) return { ok: false, reason: "no artists in D1 yet" };

  const address = pick(artists).address;
  const works = (await env.DB
    .prepare("SELECT id, price FROM artworks WHERE artist_address = ?")
    .bind(address).all()).results || [];
  if (!works.length) return { ok: false, reason: "artist has no works", address };

  const work = pick(works);
  const buyer = pick(BUYERS);
  const price = work.price;              // sold at the listed price
  const now = Date.now();
  const id = "bot-" + now.toString(36) + "-" + Math.floor(Math.random() * 1e9).toString(36);

  const tx_id = await mintReceipt(env, { address, artwork_id: work.id, buyer, price });

  await env.DB
    .prepare("INSERT INTO sales(id, artist_address, artwork_id, buyer, price, tx_id, created_at) VALUES(?,?,?,?,?,?,?)")
    .bind(id, address, work.id, buyer, price, tx_id, now).run();

  return { ok: true, sale: { id, artist_address: address, artwork_id: work.id, buyer, price, tx_id } };
}

export default {
  // The cron entrypoint — Cloudflare calls this on the schedule in wrangler.toml.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runTick(env));
  },

  // Manual trigger for testing / a forced sale: GET /tick fires one insert and
  // returns the result as JSON. Any other path is a tiny health check.
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/tick") {
      const r = await runTick(env);
      return new Response(JSON.stringify(r, null, 2), {
        headers: { "content-type": "application/json", "cache-control": "no-store" },
      });
    }
    return new Response("artists-collective-sales-bot — alive. GET /tick to force one sale.", {
      headers: { "content-type": "text/plain" },
    });
  },
};
