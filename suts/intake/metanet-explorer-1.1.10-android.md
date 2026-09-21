# Metanet Explorer 1.1.10 Android intake

Status: **artifact and runtime admitted; wallet-backed vectors blocked at ordinary account activation**.

The canonical artifact is the v1.1.10 AAB from publisher workflow run `34056462568`, pinned at SHA-256 `8746b80347252bc35606cbefa40325131c9bf79eb6dbd140458766e9d513da3d`. Bundletool 1.18.3 converted the exact AAB into a universal APK so the compiled payload could run on the laboratory emulator. The installed derivative is separately identified by SHA-256 `c8bba03da50a1f8ab61ef3c2ae45aac5d14d42bdb3eae40d709d18ae756b865f` and uses the repository's public fixture key. It is not represented as a publisher or store signature.

The package installed as `app.metanet.explorer` version 1.1.10, code 66, on the clean `TPNIL_API_36` Android arm64 emulator. Native crypto initialized. The unchanged first-run flow then required phone-number verification. The laboratory did not substitute a personal number, bypass the production UI, or import an undisclosed wallet snapshot. V001 therefore records the successful artifact/runtime assertions and the activation prerequisite as `BLOCKED`.

The app's ordinary browser loaded the pinned ToDo webroot at `http://10.0.2.2:8089`. That browser context did not expose CWI, and the application displayed its explicit Metanet Explorer requirement. This proves the application-serving and native-browser boundary. V002 through V008 remain `BLOCKED` because their wallet-backed precondition was not established.

The [machine-readable intake](metanet-explorer-1.1.10-android.json) and [offline-verifiable run record](../../journals/native-observation/2026-09-20/metanet-explorer-1.1.10-android-arm64/record.json) preserve the exact outcome. Admission does not imply conformance.
