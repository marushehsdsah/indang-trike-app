# Free deployment

Everything runs on free tiers with no credit card:

| Part | Service | Free-tier notes |
| --- | --- | --- |
| Database | [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register) M0 | 512 MB, permanent. |
| Backend (API + live updates) | [Render](https://render.com) free web service | Sleeps after 15 idle minutes; the first request then takes about a minute (the app waits up to 70 s). 750 instance hours a month covers one service. |
| Maps | [OpenFreeMap](https://openfreemap.org) | No key, account, or limit. |
| App | Local Gradle build (or EAS Build) | An APK installed straight onto phones. |

## 1. Database: MongoDB Atlas

1. Create a free account and an **M0** cluster. Pick AWS **Singapore
   (ap-southeast-1)**, closest to the Render region below.
2. **Database Access** → add a database user with a generated password.
3. **Network Access** → add `0.0.0.0/0`. Render's free services have no fixed
   outbound address, so the database user's password is what protects it.
4. **Connect → Drivers** → copy the connection string and add the database
   name before the `?`:
   `mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/indang_trike_db?retryWrites=true&w=majority`

## 2. Backend: Render

The repository contains `render.yaml`, which describes the service: it builds
from the repository root, installs only `indang-trike-backend`'s dependencies,
runs `node server.js`, and checks `/api/health`.

1. Push the code to GitHub (Render deploys from the repository).
2. In Render: **New → Blueprint**, choose this repository and branch.
3. When asked for `MONGO_URL`, paste the Atlas connection string.
4. After the deploy, open `https://<service>.onrender.com/api/health`; it shows
   `{"ok":true}` once the database is connected.

Each push to the branch redeploys automatically.

For the admin web dashboard, set the server environment variable
`GOD_VIEW_ADMIN_PHONES` to the approved existing account's mobile number (or a
comma-separated list). Open `https://<service>.onrender.com/god-view/` after
deploying. The local `.env.backend` file is not uploaded. See
[God view](god-view.md) for access setup and the mobile app rollout.

## 3. App: standalone APK

A standalone build bundles the JavaScript, so it needs no Metro and no PC; it
talks to the Render backend over HTTPS. The backend address is fixed at build
time through `EXPO_PUBLIC_API_URL`.

Locally in WSL (toolchain as in [development-build.md](development-build.md)):

```bash
export JAVA_HOME=$(echo ~/.local/android/jdk-17*) ANDROID_HOME=~/.local/android/sdk
export PATH="$JAVA_HOME/bin:$PATH"
export EXPO_PUBLIC_API_URL=https://<service>.onrender.com
npx expo prebuild --platform android --no-install
cd android
./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a,armeabi-v7a,x86_64
```

The APK is `android/app/build/outputs/apk/release/app-release.apk`. Copy it to
a phone and open it to install (allow installing from that source). It is signed
with the development key, which is fine for sideloading but not for the Play
Store; a Play Store release needs `eas build --profile production` or an upload
key.

With EAS instead: `npx eas-cli env:create --name EXPO_PUBLIC_API_URL --value
https://<service>.onrender.com --environment preview`, then
`npx eas-cli build --profile preview --platform android`.

## Keeping it awake (optional)

To avoid the one-minute wake-up, a free uptime monitor (for example
cron-job.org or UptimeRobot) can request `/api/health` every 10 minutes. One
always-on service stays within Render's 750 free hours a month.
