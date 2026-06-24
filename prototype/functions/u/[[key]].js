// GET /u/<key>  — serve an artist-uploaded image from R2.
// Uploaded artwork + profile pictures are stored in the UPLOADS bucket under a
// key like "<addr-short>/<uuid>.jpg"; the public URL is "/u/<that key>", which
// is what we save into D1 (artworks.img / artists.portrait). Static pool images
// (gen/...) keep coming from the static assets — only /u/* hits R2.
export async function onRequestGet({ params, env }) {
  if (!env || !env.UPLOADS) return new Response('storage unavailable', { status: 503 });

  const key = Array.isArray(params.key) ? params.key.join('/') : String(params.key || '');
  if (!key) return new Response('not found', { status: 404 });

  const obj = await env.UPLOADS.get(key);
  if (!obj) return new Response('not found', { status: 404 });

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('etag', obj.httpEtag);
  // Uploaded files are immutable (unique key per upload) — cache hard.
  headers.set('cache-control', 'public, max-age=31536000, immutable');
  return new Response(obj.body, { headers });
}
