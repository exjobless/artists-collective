// GET /api/artist?addr=<wallet>  -> one artist's profile + works + sales (from D1).
// The dApp Studio Dashboard fetches this so it shows the SAME sales as the
// website (until on-chain receipts land Monday). CORS-open for the dApp WebView.
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const addr = (url.searchParams.get('addr') || '').trim();
  if (!addr) return json({ error: 'missing addr' }, 400);
  if (!env || !env.DB) return json({ artist: null, works: [], sales: [] });
  try {
    const artist = await env.DB.prepare("SELECT address,handle,bio,loc,portrait FROM artists WHERE address=?").bind(addr).first();
    const works  = await env.DB.prepare("SELECT id,img,cat,title,size,medium,price FROM artworks WHERE artist_address=?").bind(addr).all();
    const sales  = await env.DB.prepare("SELECT id,artwork_id,buyer,price,tx_id,created_at FROM sales WHERE artist_address=? ORDER BY created_at DESC").bind(addr).all();
    const titleById = {};
    (works.results || []).forEach(w => titleById[w.id] = w.title);
    const salesOut = (sales.results || []).map(s => ({ ...s, title: titleById[s.artwork_id] || 'Artwork' }));
    return json({ artist: artist || null, works: works.results || [], sales: salesOut });
  } catch (e) {
    return json({ artist: null, works: [], sales: [] });
  }
}
const json = (o, status = 200) => new Response(JSON.stringify(o), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': '*' },
});
