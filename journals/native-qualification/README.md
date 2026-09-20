# Native infrastructure qualification journal

Each directory contains a `record.json` and content-addressed `objects/`. The record binds the native qualification plan, parsed observations, evaluated outcomes, and every raw evidence object. The release artifact is identified by SHA-256 and size but is not copied into these small Git journals; verify separately obtained bytes with `verify-artifact`.

Verify a bundle without GitHub or the original runner:

```sh
node bin/tpnil.mjs verify-native-qualification \
  journals/native-qualification/2026-09-20/bsv-desktop-2.8.5-macos-arm64-35533034148
```

The only claim issued here is `INFRASTRUCTURE_QUALIFICATION_ONLY`.
