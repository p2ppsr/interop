# Infrastructure qualification journal

Infrastructure qualification records establish the behavior of laboratory components without issuing SUT conformance findings. Each run directory is an offline-verifiable bundle containing a canonical `record.json` and content-addressed `objects/`.

The first retained run, `2026-09-20/todo-webroot-289591f`, executed the canonical ToDo web-root plan from clean controller revision `289591f7cbeefc89e5d438a81f7a4d7fc061fe0f`. All five assertions passed. Record hash: `4867071438a7a47bd27eb4273a7bcacbcf2f4fb6a5fdc473b5f72f4e7b49f4d7`.

Verify it without network access:

```sh
node bin/tpnil.mjs verify-qualification journals/qualification/2026-09-20/todo-webroot-289591f
```
