# E Dukaan — license admin dashboard (Cloudflare Worker)

Serves a password-protected UI at **`edukan-dash.aurobotix.com`** (configure in `wrangler.jsonc`) and reads the **same KV namespaces** as `pos-license-worker`.

## Features

- Table (desktop) + cards (mobile) listing licenses from `LICENSES` with activation counts from `ACTIVATIONS`.
- Filters: all / trial / paid / active / expired + search.
- **License key** modal: raw key, Windows-style grouped copy, clipboard.
- **Create paid license** (toolbar): new **16-character** key stored in KV — use this for customers; trial keys remain `EDUKAN-TRIAL-{machineId}` only when a trial is started from the app.

## Secrets (required)

Set on **this** worker (`edukan-dash`), reusing values from `pos-license-worker` where noted:

```bash
cd edukan-dash
npx wrangler secret put LICENSE_PRIVATE_KEY   # same PEM as license API worker (PKCS#8)
npx wrangler secret put DASHBOARD_PASSWORD    # login password (long & random)
```

**Optional:** `SESSION_SECRET` — used to sign the session cookie (HMAC). If you **omit** it, the worker **reuses `DASHBOARD_PASSWORD`** for that, so a single secret is enough. For slightly better hygiene (rotate login password without invalidating all sessions), add:

```bash
npx wrangler secret put SESSION_SECRET   # long random string, different from the login password
```

Optional plain var (if you change trial prefix in the app): add `TRIAL_LICENSE_PREFIX` under `vars` in `wrangler.jsonc` (not a secret).

## Deploy

```bash
npm install
npx wrangler deploy
```

- Ensure **`aurobotix.com`** uses Cloudflare DNS and the route in `wrangler.jsonc` matches your zone, or attach **Workers → Custom domains → edukan-dash.aurobotix.com** in the dashboard and remove/adjust `routes`.
- KV namespace IDs must match production (`LICENSES` / `ACTIVATIONS`).

## Local dev

```bash
npx wrangler dev
```

Cookies omit `Secure` on `http://localhost`. Use **HTTPS** preview (e.g. Cloudflare tunnel) if the session cookie misbehaves.

## Security notes

- Use a **strong** `DASHBOARD_PASSWORD`. Add a separate **`SESSION_SECRET`** if you want cookie signing independent of the login password (otherwise the password is reused for HMAC).
- Anyone with this password can **sign license files** for any row — treat like root access to licensing.
- Keep `LICENSE_PRIVATE_KEY` only on workers (never commit).
