# Standalone iOS production build

The `production` EAS profile builds a signed iPhone/iPad release for TestFlight
or App Store distribution. It embeds the JavaScript, map code and road graph, so
Metro and Expo Go are not needed. Booking/live updates still need the backend.

The iOS profile uses the same hosted API as the existing Android APK:
`https://indang-trike-app.onrender.com`. This public URL is explicitly configured
in `eas.json` so a cloud build cannot silently use localhost. The app identifier
is `com.indanggo.app`; build numbers are managed and incremented by EAS.

## Required account setup

- An Expo account with access to the EAS project.
- An active Apple Developer Program membership and authority to sign this app.
- Apple distribution credentials (certificate and provisioning profile), which
  EAS can help configure interactively. Complete Apple login/2FA in your own
  terminal; do not put passwords or signing files into this repository.

This checkout is developed on Linux/WSL, so the native iOS archive is built on
EAS's macOS builders. A JavaScript export alone is not an installable `.ipa`.

## Build

From the repository root:

```sh
npx eas-cli@latest login
npx eas-cli@latest init
npx eas-cli@latest credentials --platform ios
npx eas-cli@latest build --platform ios --profile production
```

During `init`, select the existing Expo project if there is one, otherwise
create it in the correct account. EAS writes the project ID to `app.json`.
During credentials setup, choose the `production` profile and the correct
Apple team. The build command prints its progress page and final artifact link.

Building does not submit the app for distribution. When ready to upload the
completed build to App Store Connect, run:

```sh
npx eas-cli@latest submit --platform ios
```

Select the intended build, then configure testers in App Store Connect's
TestFlight section. A store-signed IPA cannot be installed by simply opening
the file on an iPhone. Direct installation on registered test devices instead
requires an internal/ad hoc build and device registration.

## Local readiness checks

```sh
EXPO_PUBLIC_API_URL=https://indang-trike-app.onrender.com npx expo export --platform ios --clear --output-dir /tmp/indang-ios-production-export
npx expo config --type introspect
```

These check bundle generation and native plugin configuration, but do not
compile/sign an IPA or prove physical iPhone GPS behavior. After installing via
TestFlight, test login, location permission, maps, a passenger/driver trip, and
foreground presence in God view against the same backend.

References: [Expo iOS production builds](https://docs.expo.dev/tutorial/eas/ios-production-build/),
[EAS build configuration](https://docs.expo.dev/eas/json/).
