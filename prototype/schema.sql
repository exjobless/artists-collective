-- The Artists' Collective — dynamic layer (Cloudflare D1).
-- Artist profiles created on /join, their works, and sales (seeded now, bot later).
-- Keyed by wallet address — the single join key between dApp and website.

CREATE TABLE IF NOT EXISTS artists (
  address    TEXT PRIMARY KEY,
  handle     TEXT NOT NULL,
  bio        TEXT,
  loc        TEXT,
  portrait   TEXT,
  code_hash  TEXT,            -- SHA-256 of the one-time web-access code (for /login, gallery editing on desktop)
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS artworks (
  id             TEXT PRIMARY KEY,
  artist_address TEXT NOT NULL,
  img            TEXT NOT NULL,
  cat            TEXT,
  title          TEXT NOT NULL,
  size           TEXT,
  medium         TEXT,
  price          INTEGER NOT NULL,
  created_at     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sales (
  id             TEXT PRIMARY KEY,
  artist_address TEXT NOT NULL,
  artwork_id     TEXT NOT NULL,
  buyer          TEXT NOT NULL,
  price          INTEGER NOT NULL,
  tx_id          TEXT,
  created_at     INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_artworks_artist ON artworks(artist_address);
CREATE INDEX IF NOT EXISTS idx_sales_artist    ON sales(artist_address);
