# Upload checklist (manual GitHub)

Before you upload / push:

1. Do **not** include:
   - `node_modules/` (root, frontend, backend)
   - `frontend/dist/`
   - `backend/data/*.db` (shop database — already gitignored)
   - `*.apk` / keystores

2. Do include:
   - `frontend/` (src, android project, package-lock.json, capacitor.config.json)
   - `backend/` (server, db.js — not the live .db file)
   - `.github/workflows/build-apk.yml`
   - root `package.json`, `README.md`, `.gitignore`

3. Suggested commands:

```bash
git init
git add .
git status
git commit -m "Initial commit: ELITE CHOCOLATE POS with Capacitor APK CI"
git branch -M main
git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git
git push -u origin main
```

4. After push: GitHub → Actions → Build Android APK → download artifact.
