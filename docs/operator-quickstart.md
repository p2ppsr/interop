# Foundation operator commands

Run the dependency-free core with Node 24.7.0 or later (`.nvmrc` pins the CI runtime). The independent BRC-39 oracle uses the [native Argon2 API](https://nodejs.org/api/crypto.html#cryptoargon2algorithm-parameters-callback) introduced in Node 24.7.0. Record the exact Node and OS versions for reproducibility. CI validates the core on a hosted worker; SUT evaluation requires a qualified ITCVE.

```sh
npm test
npm run check
python3 -m unittest discover -s test -p 'test_*.py' -v
node bin/tpnil.mjs demo out/a-new-run
node bin/tpnil.mjs verify out/a-new-run
node bin/tpnil.mjs replay out/a-new-run
```

The demo executes synthetic laboratory fixtures. `verify` and `replay` validate the journal chain and recompute equality outcomes from retained observations. SUT re-execution and independent observation require separate runs. A nonpassing recorded run exits 1; malformed/incomplete evidence exits 2. `verify-prefix <old-bundle> <new-bundle>` requires a previously trusted retained checkpoint/bundle and detects replacement/truncation of its prefix.

Artifact verification streams bytes without executing the artifact:

```sh
node bin/tpnil.mjs verify-artifact path/to/artifact <64-hex-sha256>
```

Compiled web roots can be packaged with Python's standard library:

```sh
python3 scripts/package-webroot.py path/to/compiled-webroot out/application.tgz > out/application.manifest.json
```

The packager fixes paths, ownership, modes, timestamps and gzip metadata, rejects symlinks/nonregular files and environment/source-control files, limits input to 10,000 files/256 MiB, and refuses overwrite. It requires `index.html`. Pin Python/zlib/OS along with the compiler and package lock for cross-host reproducibility; two matching local builds are not independent laboratory reproduction. This tool does not safely extract arbitrary submitted archives or provision HTTPS.

The local journal uses a single-writer lock. After a crashed process, preserve a copy and inspect the journal with `verify` before manual recovery. Lock removal requires confirmation that the writer has stopped; interrupted journal content remains preserved during recovery. Restore from a known checkpoint or publish a separately identified recovery record; orphan staging objects are not valid runs. Official publication additionally requires the governance/evidence launch gates.

Production-artifact intake uses a separate command:

```sh
node bin/tpnil.mjs review-intake suts/intake/bsv-desktop-2.8.5.json out/artifacts/BSV-Desktop-2.8.5-arm64-mac.dmg
```

The [intake contract](intake.md) defines required evidence and exit codes. Its output is an intake review, separate from synthetic self-tests and executed SUT results.

`node scripts/verify-published-journals.mjs` verifies retained self-test, intake, portable qualification, and native qualification objects. Native archive verification recomputes its findings without the runner or network; `verify-artifact` separately verifies obtained release bytes against the recorded digest.

Prepare and execute the admitted Yours Wallet profile with:

```sh
scripts/prepare-yours-wallet-run.sh
npm ci --prefix synthesis --ignore-scripts
npm run typecheck --prefix synthesis
npm test --prefix synthesis
npm --prefix synthesis run wallet-lab -- run ../infra/plans/isi4-yours-todo-controlled-services.json
npm --prefix synthesis run wallet-lab -- verify ../out/isi4-yours-todo-controlled-services
```

The runner requires two repetitions. It records failed and blocked vectors and exits nonzero only when the two semantic projections differ or the harness cannot produce verifiable evidence. The retained ToDo archive is under `fixtures/artifacts/`; the exact public Yours archive is downloaded and verified by the preparation script.

Android operators use `scripts/native/android/create-avd.sh`, `launch-emulator.sh`, `bundle-to-universal-apk.sh`, `capture-runtime.sh`, and the optional uiautomator2 driver. The public fixture key under `fixtures/keys/` signs laboratory derivatives and carries no publisher identity. `.github/workflows/isi4-android-qualification.yml` executes the same boundary on the owned KVM runner.
