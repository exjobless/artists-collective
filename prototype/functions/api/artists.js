// GET /api/artists  -> dynamic artists + works + sales as JSON.
// The gallery (index.html) fetches this and merges dynamic artists in beside
// the seeded ones. Returns an empty set if D1 isn't bound yet.
export async function onRequestGet({ env }) {
  const empty = { artists: [], works: [], sales: [] };
  if (!env || !env.DB) return json(empty);
  try {
    const [a, w, s] = await Promise.all([
      env.DB.prepare("SELECT address,handle,bio,loc,portrait FROM artists ORDER BY created_at DESC").all(),
      env.DB.prepare("SELECT id,artist_address,img,cat,title,size,medium,price FROM artworks").all(),
      env.DB.prepare("SELECT id,artist_address,artwork_id,buyer,price,tx_id FROM sales ORDER BY created_at DESC").all(),
    ]);
    return json({ artists: a.results || [], works: w.results || [], sales: s.results || [] });
  } catch (e) {
    return json(empty);
  }
}
const json = (o) => new Response(JSON.stringify(o), {
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': '*' },
});
