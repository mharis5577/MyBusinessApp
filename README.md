# ELITE CHOCOLATE — POS & Bills

## Quick start (PC / browser)

From the project root:

```bash
npm run install:all
npm start
```

- Frontend: http://localhost:10000  
- Backend API: http://localhost:11000  

Create Bill on PC requires **both** servers. Vite proxies `/api` to port 11000.

Dates and defaults use **Pakistan time (Asia/Karachi)** and **Rs. / PKR**.

---

## Upload to GitHub (manual)

1. On GitHub, create a **new empty repository** (no README).
2. In this folder, open a terminal and run:

```bash
git init
git add .
git status
git commit -m "Initial commit: ELITE CHOCOLATE POS with Capacitor APK CI"
git branch -M main
git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git
git push -u origin main
```

Or drag-and-drop the project into GitHub Desktop / upload via the website — **do not upload** `node_modules`, `frontend/dist`, or `backend/data/*.db` (already listed in `.gitignore`).

After push, open **Actions → Build Android APK** to get the phone APK artifact.

---

## Android APK (one phone, on-device storage)

The mobile APK stores bills, clients, and products **on the phone** (IndexedDB). No PC backend is required for day-to-day Create Bill.

### Get the APK from GitHub Actions

1. Push this repo (see above).
2. GitHub → **Actions** → **Build Android APK** → wait for success.
3. Open the run → **Artifacts** → download **elite-chocolate-apk**.
4. Unzip and install `app-release.apk` (allow unknown sources).

This build is **version 1.1.0** (`versionCode` 2) and is signed with a stable key so later APKs can **update** the app already on the phone.

- Same package name: `pk.elitechocolate.pos.test`
- Higher version than the first GitHub APKs
- Same signing key from now on

**First time only:** the APKs already on the phone were unsigned GitHub debug builds. Android will not treat those as the same app, so uninstall CocoaDesk once, then install `app-release.apk`. After that, every new APK from Actions should say **Update**.

Manual run: **Actions → Build Android APK → Run workflow**.

### Local APK build (optional)

```bash
cd frontend
npm ci
npm run build:apk
npx cap sync android
cd android
./gradlew assembleRelease
```

APK: `frontend/android/app/build/outputs/apk/release/app-release.apk`

### Data modes

| Where | Storage |
|-------|---------|
| Browser on PC (`npm start`) | Express + SQLite on port 11000 |
| Android APK | On-device IndexedDB only (`VITE_DATA_MODE=local`) |

Use **Settings → Backup / Restore** to export or import JSON.

Fresh installs start with **Revenue paid = Rs. 0** until you mark bills as paid.
