# Development build

The map uses MapLibre (`@maplibre/maplibre-react-native`) with free
[OpenFreeMap](https://openfreemap.org) tiles: no Google Maps API key or billing.
MapLibre is native code that Expo Go does not contain, so the app runs in its own
**development build** instead: an "IndangGO" app that works like Expo Go for this
project. Install it once; rebuild only when native dependencies or `app.json`
change. JavaScript changes still reload live from Metro.

## Option A: build in Expo's cloud (EAS)

Easiest for a phone. Needs a free [Expo account](https://expo.dev/signup); the
free plan includes 15 Android builds a month, in a queue that can be slow.

```bash
npx eas-cli login
npx eas-cli build --profile development --platform android
```

The first build asks to create the EAS project (it adds its id to `app.json`)
and to generate an Android signing key; accept both. When it finishes, open the
build link on the phone and install the APK.

## Option B: build locally in WSL

A JDK 17 and a Linux Android SDK live in `~/.local/android` (the SDK licence was
copied from the Windows Android SDK). They are kept out of `~/Android/Sdk` so
`start.sh` keeps using the Windows `adb` that reaches the emulator.

```bash
export JAVA_HOME=$(echo ~/.local/android/jdk-17*) ANDROID_HOME=~/.local/android/sdk
export PATH="$JAVA_HOME/bin:$PATH"
npx expo prebuild --platform android --no-install   # regenerates android/ (git-ignored)
cd android
# arm64-v8a for phones, x86_64 for the emulator
./gradlew assembleDebug -PreactNativeArchitectures=arm64-v8a,x86_64
```

The APK is `android/app/build/outputs/apk/debug/app-debug.apk`. Gradle downloads
the NDK, SDK platform and build tools on the first run, which takes a while.

Install it on the emulator (or a USB-connected phone) with the Windows `adb`:

```bash
ADB='/mnt/c/Users/Michael D. Valledor/AppData/Local/Android/Sdk/platform-tools/adb.exe'
cp android/app/build/outputs/apk/debug/app-debug.apk /mnt/c/Users/Public/indanggo-dev.apk
"$ADB" install -r 'C:\Users\Public\indanggo-dev.apk'
```

## Running it

Run `./start.sh`, open the IndangGO app, and pick the dev server it lists (or
scan the QR code). In the Expo terminal, `a` opens it on the emulator. A phone
must reach Metro and the backend, see [wsl-phone-networking.md](wsl-phone-networking.md).

## Standalone APK (no Metro)

`npx eas-cli build --profile preview --platform android` bundles the JavaScript
into the APK. It has no Metro to find the backend from, so first host the
backend somewhere the phone can reach over HTTPS and set `EXPO_PUBLIC_API_URL`
for the build (for example with `npx eas-cli env:create`).
