#!/usr/bin/env python3
"""
The Artists' Collective — backend (server-side, app-key writer).

Evan (Usernode dev) confirmed: transactions signed with the APP-OWNED key need
only the server — no user approval. This service holds the app key, talks to a
Usernode node's wallet RPC, and writes the chain entries the buyer website can't
sign for itself (artist enrolment, sale records). User-signed actions — the
governance vote — happen in the dApp with the artist's own key, NOT here.

Stdlib only (no pip). Run:  python server.py
Config via env (see .env.example). Nothing here works until APP_SECRET_KEY +
NODE_RPC_URL are real — until then it runs in DRY mode and just echoes what it
*would* submit, so the front-ends can be wired and tested end to end.

--- Node wallet RPC (RESOLVED 2026-06-22 from dapp-starter last-one-wins) ---
  POST {NODE}/wallet/signer
       body  {"secret_key": "<utsk...>"}            -> {"ok": true}
       Registers the app's secret key as an in-process signer. Call once.
  POST {NODE}/wallet/send
       body  {"from_pk_hash": "<ut1 ADDRESS>",      -> {"queued": true, ...}
              "to_pk_hash":   "<ut1 ADDRESS>",
              "amount": N, "fee": 0,
              "memo": "<base64url(JSON)>"}
       Node picks a UTXO, signs, submits. fee is ALWAYS 0; SINGLE-INPUT only
       (if no single UTXO covers `amount`, do a consolidation self-send first).
  Reads: POST {NODE}/transactions/by_recipient {"recipient","limit"} (see read_ledger()).

KEY GOTCHAS (the EVAN-Q1 unknowns, now resolved):
  * The wallet RPC keys off the `ut1...` ADDRESS (APP_ADDRESS), NOT the `utpk...`
    raw public key. Passing APP_PUBKEY to from_pk_hash/to_pk_hash is wrong.
  * `memo` must be base64url-encoded JSON bytes (unpadded) — the node serializes
    Memo as base64url; passing raw JSON gets mis-stored.
  * /wallet/signer takes ONLY {"secret_key"} — no pubkey field.
  EVAN-Q2: voting primitive — handled in the dApp (user key), not here.
"""
import json, os, sys, time, base64, urllib.request, urllib.error, pathlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# ---------- config ----------
def _load_env():
    # local .env (gitignored) first, then process env
    envf = pathlib.Path(__file__).parent / ".env"
    if envf.exists():
        for line in envf.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                os.environ.setdefault(k.strip(), v.strip())
_load_env()

NODE_RPC_URL = os.environ.get("NODE_RPC_URL", "").rstrip("/")     # e.g. http://127.0.0.1:3000
APP_PUBKEY   = os.environ.get("APP_PUBKEY", "")                   # utpk... raw pubkey (NOT used for wallet RPC)
APP_SECRET   = os.environ.get("APP_SECRET_KEY", "")              # utsk... signer secret
APP_ADDRESS  = os.environ.get("APP_ADDRESS", "")                 # ut1... address — THIS is the wallet-RPC identity
TREASURY     = os.environ.get("TREASURY_ADDRESS", APP_ADDRESS)   # ledger address (self-send target for receipts)
FEE_PCT      = float(os.environ.get("FEE_PCT", "20"))
PORT         = int(os.environ.get("PORT", "8099"))
BIND_HOST    = os.environ.get("BIND_HOST", "127.0.0.1")          # private by default (shared box)
# Receipt sends carry their data in the memo; amount is just a carrier. 0 is
# rejected by the chain, so use 1 base unit (recoverable — it self-sends back).
RECEIPT_AMOUNT = int(os.environ.get("RECEIPT_AMOUNT", "1"))
DRY = not (NODE_RPC_URL and APP_SECRET and APP_ADDRESS)           # no real chain yet -> echo mode

# ---------- node RPC ----------
def _rpc(method, path, body=None):
    url = NODE_RPC_URL + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode() or "{}")

def _memo_b64(obj):
    """Encode a memo dict as the node's wire format: unpadded base64url(JSON)."""
    raw = json.dumps(obj, separators=(",", ":")).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")

_signer_ready = False
def ensure_signer():
    """Register the app secret key as an in-process signer on the node (once)."""
    global _signer_ready
    if DRY or _signer_ready:
        return
    resp = _rpc("POST", "/wallet/signer", {"secret_key": APP_SECRET})
    if not resp.get("ok"):
        raise RuntimeError(f"signer registration rejected: {resp}")
    _signer_ready = True

def _wallet_send(to_addr, amount, memo_b64):
    payload = {"from_pk_hash": APP_ADDRESS, "to_pk_hash": to_addr,
               "amount": int(amount), "fee": 0, "memo": memo_b64}
    try:
        return _rpc("POST", "/wallet/send", payload)
    except urllib.error.HTTPError as e:
        # The node returns 400 with a JSON body {queued:false, error, tx_id}
        # for wallet problems (e.g. UTXO fragmentation / no funds). Return that
        # body rather than raising, so the consolidation-retry path is reachable
        # and the caller gets an honest "saved, receipt couldn't post" result.
        try:
            return json.loads(e.read().decode() or "{}")
        except Exception:
            return {"queued": False, "error": f"node {e.code}"}

def _find_tx_id(recipient, memo_b64, tries=8, delay=4):
    """Best-effort: poll the node for the just-sent tx so we can return an
    explorer-verifiable hash. The node stores memos as base64url, so we match
    on the encoded string directly. Returns the tx_id or None."""
    for _ in range(tries):
        try:
            resp = _rpc("POST", "/transactions/by_recipient", {"recipient": recipient, "limit": 25})
            for it in (resp.get("items") or []):
                if it.get("memo") == memo_b64:
                    return it.get("tx_id")
        except Exception:
            pass
        time.sleep(delay)
    return None

def submit_tx(to_addr, amount, memo_obj):
    """Write one app-key-signed transaction. On single-UTXO failure, consolidate
    (self-send) and retry once. Returns {queued, tx_id, ...} or a dry echo."""
    if DRY:
        return {"dry": True, "from": APP_ADDRESS or "APP", "to": to_addr, "amount": amount, "memo": memo_obj}
    ensure_signer()
    memo_b64 = _memo_b64(memo_obj)
    resp = _wallet_send(to_addr, amount, memo_b64)
    if not resp.get("queued"):
        # UTXO fragmentation: merge into one output, wait for it to land, retry.
        _wallet_send(APP_ADDRESS, amount, _memo_b64({"t": "CONSOLIDATE"}))
        time.sleep(12)
        resp = _wallet_send(to_addr, amount, memo_b64)
    tx_id = _find_tx_id(to_addr, memo_b64) if resp.get("queued") else None
    return {"queued": bool(resp.get("queued")), "tx_id": tx_id, "memo_b64": memo_b64, "raw": resp}

def read_ledger(limit=50):
    """All collective events are self-sends to APP_ADDRESS, so the node's
    per-recipient buffer is the ledger."""
    if DRY:
        return {"dry": True, "items": []}
    return _rpc("POST", "/transactions/by_recipient", {"recipient": APP_ADDRESS, "limit": limit})

# ---------- domain actions ----------
def enrol_artist(address, name):
    """Record an artist joining the collective (app-key, no user approval).
    Self-send to the ledger address; the artist's address lives in the memo so
    the whole membership history is queryable via read_ledger()."""
    memo = {"t": "JOIN", "artist": name, "addr": address}
    tx = submit_tx(TREASURY, RECEIPT_AMOUNT, memo)
    return {"action": "enrol", "address": address, "name": name, "tx": tx}

def record_sale(artist_address, title, amount, buyer_ref=""):
    """Record a fiat sale on-chain: who sold what, price, and the 20% fee split.
    The fee is app-level data in the memo, NOT a chain fee (chain fee is always 0).
    Notarised receipt only — the money itself moves in fiat off-chain."""
    fee = round(amount * FEE_PCT / 100)
    artist_net = amount - fee
    memo = {"t": "SALE", "title": title, "amount": amount, "artist": artist_address,
            "artist_net": artist_net, "fee": fee, "buyer": buyer_ref}
    tx = submit_tx(TREASURY, RECEIPT_AMOUNT, memo)
    return {"action": "sale", "title": title, "amount": amount, "artist_net": artist_net,
            "fee": fee, "tx": tx}

# ---------- http ----------
class H(BaseHTTPRequestHandler):
    def _send(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")          # site is on a different origin
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)
    def _body(self):
        n = int(self.headers.get("Content-Length", 0) or 0)
        return json.loads(self.rfile.read(n).decode() or "{}") if n else {}
    def do_OPTIONS(self): self._send(204, {})
    def log_message(self, *a): pass
    def do_GET(self):
        if self.path == "/health":
            return self._send(200, {"ok": True, "dry": DRY, "node": NODE_RPC_URL or None,
                                    "address": APP_ADDRESS or None, "signer_ready": _signer_ready})
        if self.path.startswith("/api/ledger"):
            return self._send(200, read_ledger())
        self._send(404, {"error": "not found"})
    def do_POST(self):
        try:
            b = self._body()
            if self.path == "/api/enrol":
                return self._send(200, enrol_artist(b["address"], b.get("name", "")))
            if self.path == "/api/sale":
                return self._send(200, record_sale(b["artist_address"], b.get("title", ""),
                                                   int(b["amount"]), b.get("buyer_ref", "")))
            self._send(404, {"error": "not found"})
        except KeyError as e:
            self._send(400, {"error": f"missing field {e}"})
        except urllib.error.HTTPError as e:
            self._send(502, {"error": f"node {e.code}", "detail": e.read().decode(errors='replace')[:300]})
        except Exception as e:
            self._send(500, {"error": str(e)})

if __name__ == "__main__":
    mode = "DRY (echo only — set NODE_RPC_URL + APP_SECRET_KEY to go live)" if DRY else f"LIVE -> {NODE_RPC_URL}"
    print(f"Artists' Collective backend on {BIND_HOST}:{PORT} — {mode}", flush=True)
    ThreadingHTTPServer((BIND_HOST, PORT), H).serve_forever()
