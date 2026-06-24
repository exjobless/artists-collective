# Backend — server-side app-key writer

Writes the chain entries that can't be user-signed: **artist enrolment** and **sale records**.
Evan (Usernode dev) confirmed transactions signed with the **app-owned key** need only the
server — no user approval. (The **governance vote** is user-signed and lives in the dApp, not here.)

```
buyer website  ─POST /api/sale──┐
artist signup  ─POST /api/enrol─┼─►  this backend ──(app key)──►  Usernode node /wallet/send  ──► chain
                                │
dApp / website ◄─GET /api/ledger┘                       (governance vote: dApp → user's own key)
```

## Run
```
cp .env.example .env     # fill APP_SECRET_KEY + NODE_RPC_URL to go live
python server.py         # stdlib only; :8099
```
With no keys it runs **DRY** (echoes what it would submit) so the front-ends work end-to-end now.

## Endpoints
| | |
|---|---|
| `GET /health` | status + dry/live |
| `POST /api/enrol` `{address, name}` | record an artist joining |
| `POST /api/sale` `{artist_address, title, amount, buyer_ref?}` | record a sale + fee split |
| `GET /api/ledger` | read chain entries |

## Pending Evan (then this goes live)
1. **App key** — how to obtain/register it (`/wallet/signer` payload + `/wallet/send` field names). Marked `EVAN-Q1` in `server.py`.
2. **Node** — stand up a `usernodelabs/usernode` sidecar on Julius, set `NODE_RPC_URL`. (Needs Nemanja's OK to run the container.)

## Wiring the front-ends (when live)
- **Website** (`prototype/`): point the signup → `POST /api/enrol`, the checkout → `POST /api/sale`. Both currently mock; swap the mock call for a `fetch(API_BASE + ...)`.
- **dApp** (`../artists-collective-dapp`): enrolment/sales can use this backend; the **vote** stays in-app (`window.sendTransaction`, user key).
