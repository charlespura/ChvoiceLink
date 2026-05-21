# ChvoiceLink

Static voice-recording + sharing page for Firebase Hosting / GitHub Pages.

## What this adds

- Firestore collection: `recordings`
- Storage folder: `recordings/`
- Smart expiry fields: `views`, `lastViewedAt`, `expiresAt`, `keepForever`

This does **not** remove or modify your existing collections:
`reservations`, `socialLinks`, `starCounters`, `studentLogs`.

## Run locally

1) Create local env file:

```bash
cp .env.example .env
```

2) Generate `src/firebase.config.js` from `.env`:

```bash
node scripts/gen-firebase-config.mjs
```

This creates `env.js` (runtime config) in the project root.

3) Open `index.html` using a local server (recommended):

```bash
python3 -m http.server 5173
```

Then visit `http://localhost:5173/`.

### XAMPP option (no env.js needed)

If you open via XAMPP like `http://localhost/GithubProject/ChvoiceLink/`, the app can also read `.env` directly via `env.php`.

## Firebase config (not committed)

This repo ignores `env.js` and `.env`.

- For local dev: fill `.env`, then run `node scripts/gen-firebase-config.mjs` to generate `env.js`.
- For GitHub Pages: `.github/workflows/deploy.yml` generates `env.js` from GitHub repo secrets.

Secrets to add in GitHub repo settings:

- `FIREBASE_API_KEY`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_MESSAGING_SENDER_ID`
- `FIREBASE_APP_ID`
- `FIREBASE_MEASUREMENT_ID`

## Share links

Links are `?v=<recordingId>` (works on GitHub Pages without server rewrites).
