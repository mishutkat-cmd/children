# Secrets — what we have, where it lives, when to rotate

This is the operational runbook for every secret the system depends on.
If something is on disk, in GitHub Actions, in Firebase, or in a
password manager, it's listed here with its rotation cadence and the
exact steps to rotate it without taking the service down.

Last reviewed: **2026-06-16**.

## Inventory

| Secret | Where it lives | Used for | Rotate every | Last rotated |
|---|---|---|---|---|
| **JWT_SECRET** | `~/.secrets/children/children.env` on VPS | Signs/verifies access tokens (`@nestjs/jwt`) | 12 months *or* on suspected leak | 2026-04-29 |
| **Firebase service-account JSON** | `~/.secrets/children/firebase-sa.json` on VPS | Admin SDK auth (Firestore + Storage) | 90 days *or* on suspected leak | 2026-04-29 |
| **DEPLOY_SSH_KEY** (GitHub Actions) | GitHub repo Secrets → `DEPLOY_SSH_KEY` | CI deploy via SSH (`appleboy/ssh-action`) | 180 days *or* if any maintainer with deploy access offboards | 2026-04-29 |
| **STORAGE_API_KEY** (optional) | `~/.secrets/children/children.env` if set | Gates `/api/v1/storage/*` KV endpoints (frontend doesn't use them) | If used: 12 months. Currently unset → endpoints fail-closed. | n/a |
| **CORS_ORIGINS** | `~/.secrets/children/children.env` | CORS allowlist | Edit when adding/removing a frontend host | 2026-04-29 |
| **Firebase Web API key** | hardcoded in `mobile/src/lib/firebase.ts` *(now removed; left here as a note)* | Was used by mobile Firebase JS SDK | Not a secret per Google's design, but worth not embedding — mobile now talks only to our backend | — |
| **GitHub repo admin access** | GitHub org / personal accounts | Can read/overwrite all of the above secrets via GitHub UI | Review on every team change; require 2FA on every admin | — |
| **VPS root / odoo user SSH keys** | `~/.ssh/authorized_keys` on VPS | Login to the server | Audit on every team change | — |

## When to rotate immediately, regardless of cadence

- A laptop with `id_ed25519_children_ci` or `firebase-sa.json` is lost or stolen
- A maintainer with deploy access leaves the team
- A `git log` shows any of these committed by mistake
- Sentry / logs show a previously-unknown IP succeeding at SSH or admin endpoints
- Firebase Console shows unauthorized service-account activity

## Rotation runbooks

### JWT_SECRET

**Impact of rotation:** every existing access token becomes invalid →
**every active user is logged out**. Schedule for a low-traffic window
(early morning or weekend).

Steps:

1. Generate a new secret on the server (does not need to leave the box):
   ```
   ssh -p 22022 odoo@91.227.181.162 'openssl rand -hex 48'
   ```
2. Edit `~/.secrets/children/children.env`, replace the `JWT_SECRET=…` line.
3. `pm2 reload children --update-env` to pick up the new env without
   downtime; existing requests in flight finish on the old secret, new
   requests use the new one.
4. **Heads-up users in advance** if possible — explain they'll need to
   sign in again.

If you accidentally lose the new secret before rolling forward, the
fastest recovery is to set a fresh one via the same steps; the only
visible effect on users is the same "everyone logs in again".

### Firebase service-account JSON

**Impact of rotation:** none, if done in this order (generate-first,
deploy, then revoke the old).

Steps:

1. https://console.firebase.google.com → project `childrenevolvenext`
   → Settings (gear) → Service accounts → Generate new private key.
2. Download the JSON, copy to the VPS in place:
   ```
   scp -P 22022 firebase-sa-new.json odoo@91.227.181.162:~/.secrets/children/firebase-sa.json.new
   ssh -p 22022 odoo@91.227.181.162
   chmod 600 ~/.secrets/children/firebase-sa.json.new
   mv ~/.secrets/children/firebase-sa.json.new ~/.secrets/children/firebase-sa.json
   pm2 reload children --update-env
   ```
3. Hit `/health` and confirm `firebase.enabled === true`.
4. Back in the Firebase Console, **revoke the old key** from the same
   Service Accounts page. The active service-account user stays the
   same; only the credentials are new.

### DEPLOY_SSH_KEY (GitHub Actions)

Steps:

1. Generate a new keypair locally:
   ```
   ssh-keygen -t ed25519 -N "" -C "github-actions-children-deploy" \
     -f ~/.ssh/id_ed25519_children_ci_new
   ```
2. Append the new **public** key to `~odoo/.ssh/authorized_keys` on the
   VPS — keep the old one in there for now so deploys don't break
   mid-rotation.
3. Update `DEPLOY_SSH_KEY` in GitHub repo settings → Secrets → Actions
   with the contents of the new **private** key.
4. Trigger a workflow_dispatch on the deploy workflow and confirm it
   goes green.
5. Remove the old public key line from `~odoo/.ssh/authorized_keys`.
6. Delete `~/.ssh/id_ed25519_children_ci` locally; rename `_new` → no
   suffix.

### STORAGE_API_KEY

Only relevant if the `_kv` collection ever needs to be hit by an
external integration. Currently:

- env var unset → `storage-kv` controller fails closed
- frontend doesn't use these endpoints

If introduced:

1. Generate: `openssl rand -hex 24`.
2. Add `STORAGE_API_KEY=…` to `~/.secrets/children/children.env`.
3. `pm2 reload children --update-env`.
4. Distribute to the consuming integration via a separate channel
   (1Password vault, signed email, etc).

To rotate later: same as JWT, but downtime risk is whatever client uses
the key, not all users.

## Where the file `~/.secrets/children/` is *not* backed up

This is the dangerous one. As of this writing the secret store on the
VPS is not synchronized anywhere off the box. If the VPS dies:

- **JWT_SECRET**: gone, but generating a new one only logs everyone
  out. Recoverable.
- **firebase-sa.json**: gone, but a new key can be minted from the
  Firebase Console. Recoverable.
- **STORAGE_API_KEY**: if it was set and you didn't write it down
  anywhere else, the only consumer that knew about it has to be re-keyed.

Action item still open from Phase 4: drop a copy of `children.env` and
`firebase-sa.json` (filenames + content) in 1Password under a
`children-prod-secrets` item so a wipe doesn't lose them. Mention the
item ID in this file when done.

## What I will check on every release

This isn't part of any pipeline yet — it's a manual reminder. On
release day:

- `git log -p HEAD~30..HEAD --diff-filter=A | grep -iE 'BEGIN (RSA|EC|OPENSSH) PRIVATE'` — no private keys snuck in
- `grep -rE 'AIza[0-9A-Za-z\-_]{35}' . --exclude-dir=node_modules --exclude-dir=build --exclude-dir=dist` — no API keys leaked into committed code (the Firebase web key is per Google's design *not* a secret, but it shouldn't be embedded either)
- `.gitignore` still lists `*.env`, `mobile/`, `.secrets/`, and the SA JSON files at the repo root

## Owner

Single point of failure today: **mishutkat-cmd**. If responsibilities
ever split, this file gets two columns (primary / backup).
