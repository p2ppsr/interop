# Foundation operator commands

For the integrated TS/Go component matrix and separate native wallet lane,
follow [ITCVE-1 1.3.0](../itcves/ITCVE-1/1.3.0/README.md). Its runner requires
committed source and fresh output directories, executes all declared lanes and
repetitions, and verifies observations with independent oracles. Upstream
failures remain data; missing evidence or failed cleanup prevents qualification.
The [results report](integrated-lab-results-2026-11-06.md) links original evidence
and the independent archive-verification command.

Use the Node.js version pinned in `.nvmrc` and Python 3. Record the actual Node and OS versions for each new run; historical journals retain their original runtimes and verdicts. The independent BRC-39 oracle uses Node's [native Argon2 API](https://nodejs.org/api/crypto.html#cryptoargon2algorithm-parameters-callback).

The dependency-free core runs locally. CI validates it on hosted workers; SUT execution uses the selected ITCVE.

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

The local journal uses a single-writer lock. After a crashed process, preserve a copy and inspect the journal with `verify` before manual recovery. Lock removal requires confirmation that the writer has stopped; interrupted journal content remains preserved during recovery. Restore from a known checkpoint or publish a separately identified recovery record; orphan staging objects are not valid runs. Public distribution follows the recorded artifact and evidence permissions; certification requires a separately established program.

Production-artifact intake uses a separate command:

```sh
node bin/tpnil.mjs review-intake suts/intake/bsv-desktop-2.8.5.json out/artifacts/BSV-Desktop-2.8.5-arm64-mac.dmg
```

The [intake contract](intake.md) defines required evidence and exit codes. Its output is an intake review, separate from synthetic self-tests and executed SUT results.

`node scripts/verify-published-journals.mjs` verifies retained self-test, intake, portable qualification, and native qualification objects. Native archive verification recomputes its findings without the runner or network; `verify-artifact` separately verifies obtained release bytes against the recorded digest.

## Wallet execution

These commands acquire a publisher binary, install dependencies and execute the declared controlled-service profile. Prepare the required browser/runtime environment under the [infrastructure guide](../infra/README.md) before running the wallet.

Prepare and execute the Yours Wallet profile with:

```sh
scripts/prepare-yours-wallet-run.sh
npm ci --prefix synthesis --ignore-scripts
npm run typecheck --prefix synthesis
npm test --prefix synthesis
npm --prefix synthesis run wallet-lab -- run ../infra/plans/isi4-yours-todo-controlled-services.json
npm --prefix synthesis run wallet-lab -- verify ../out/isi4-yours-todo-controlled-services
```

The runner requires two repetitions. It records failed and blocked vectors and exits nonzero only when the two semantic projections differ or the harness cannot produce verifiable evidence. The retained ToDo archive is under `fixtures/artifacts/`; the exact public Yours archive is downloaded and verified by the preparation script.

### Desktop wallets on the HTTP JSON substrate

The `http-desktop-wallet` driver exercises the same eight ISI-4 vectors against a desktop wallet that serves the BRC-100 HTTP JSON substrate on loopback, by default `http://localhost:3321`. It emits `ENGINEERING_OBSERVATION_ONLY` records and series. The ToDo application and the boundary fixture pages call the wallet from Chromium with an `Originator` header. Assertion identifiers, evidence names and verdict predicates follow the browser-extension driver. The method inventory of V008 counts the methods that answer an empty-argument probe with a status other than 404 or 501.

The driver does not install or reset the external wallet or enforce its process-level network policy. The browser proxy and loopback hooks do not establish closure for wallet, storage or subprocess traffic. Records mark public-mainnet broadcast and undeclared egress `not-observed`. Use an isolated laboratory identity and externally enforced network closure before execution. Separate intake evidence must bind the installed artifact, establish clean wallet and service state before every repetition, and verify whole-process egress controls before a desktop profile can produce scored conformance results. A matching series alone establishes neither clean reset nor qualification.

The operator installs and initializes the wallet through its ordinary interface, enables its HTTP substrate and records each changed setting in `walletConfiguration`. When `walletArchive` is present, the runner verifies it against `walletArtifact` before execution.

Wallet prompts are answered in one of two declared modes:

- `attended`: a person answers each prompt at the wallet. The driver prints the expected decision, waits up to `timeoutMs` for each wallet call and records its instructions in `prompt-answering.json`. It does not observe the decisions.
- `declared-hook`: the wallet publisher documents an automation hook on loopback. The configuration names its documentation, the URL that lists pending prompts, the URL that receives a decision and, where they differ from `id`, `origin`, `kind`, `text` and `decision`, the field names it uses. The driver sends the laboratory decision of the browser-extension driver: deny the `tpnil denied permission` and `tpnil origin isolation` requests and allow the others. Every hook request and response is retained in `declared-hooks.json` and every decision in `permissions.json`.

Pending prompts require an identifier, origin and decision text before any answer is sent. V005 recognizes HTTP 401/403 refusals or HTTP 400 replies describing a permission refusal; missing methods, argument errors, server failures and timeouts cannot satisfy its denial assertions.

The fixture environment is either the controlled services of the Yours profile (`controlled-services`), which the wallet must reach through its supported service settings, or a declared loopback fixture hook (`declared-hook`) that pays the derived funding key, schedules accepted or rejected submission verdicts and reports submissions. A fixture hook returns the raw funding transaction with its block height, Merkle root and block transaction list. The driver builds the proof and verifies it against that supplied root before internalization; this alone does not independently authenticate a block header or establish funding ancestry. Submission observations require an exact `ACCEPTED_BY_NETWORK` or `REJECTED` verdict and a transaction id; supplied raw bytes must match that id. Hooks must be loopback URLs without credentials; redirects are rejected. Aborted attempts retain accumulated evidence and an `attempt-failure.json` file without a completed result record.

```json
{
  "schema": "tpnil-isi4-wallet-run-config@1.0.0",
  "driver": "http-desktop-wallet",
  "baseDirectory": "../..",
  "webroot": "out/sut-artifacts/todo-ts-236733c/webroot",
  "applicationArchive": "fixtures/artifacts/todo-ts-236733c-webroot.tgz",
  "outputDirectory": "out/isi4-http-desktop-wallet",
  "repetitions": 2,
  "walletArchive": "out/sut-artifacts/desktop-wallet/installer.bin",
  "walletArtifact": { "id": "desktop-wallet", "version": "1.0.0", "sha256": "<64 hex>", "size": 0 },
  "applicationArtifact": { "id": "todo-ts-compiled-webroot", "version": "236733c586c4d2cc3ab7f957afa382005509acd4", "sha256": "b3c41dc60ba99b497231008a15033a60110cc7cd60b2d4fffd405e33f4979ddc", "size": 502803 },
  "expectedWalletVersion": "<exact getVersion answer>",
  "walletUrl": "http://localhost:3321",
  "prompts": { "mode": "attended", "timeoutMs": 300000 },
  "fixture": { "mode": "controlled-services" },
  "walletConfiguration": ["<each supported setting changed for the run>"]
}
```

An operator who runs the vectors on another network declares `networkDeviation` with the network the wallet reports and the reason. The `mainnet-configuration` assertion is then `NOT_APPLICABLE` when the wallet reports the declared network, the deviation appears in the V001 limitations and the configuration, and the run is outside the mainnet profile.

Android operators use `scripts/native/android/create-avd.sh`, `launch-emulator.sh`, `bundle-to-universal-apk.sh`, `capture-runtime.sh`, and the optional uiautomator2 driver. The public fixture key under `fixtures/keys/` signs laboratory derivatives and carries no publisher identity. `.github/workflows/isi4-android-qualification.yml` executes the same boundary on the owned KVM runner.

## Go service components

Run `npm run test:go` after installing the locked synthesis dependencies. The
[component profile](../itcves/ITCVE-1/1.1.0/README.md) documents prerequisites,
independent role selection, wallet/Android configuration, evidence, teardown and
the boundary between sparse fixture replay and native ChainTracks recovery.

## Native all-Go wallet qualification

The [ITCVE-1 1.2.0 protocol](../itcves/ITCVE-1/1.2.0/README.md) admits the
unchanged Yours Wallet 5.1.0 Chromium artifact on native Linux/amd64. Run the
manual **ISI-4 Yours Wallet controlled-service run** workflow with
`profile=all-go-native` on the committed source revision. The workflow prepares
and hashes the archives, builds the locked Go binaries and pinned browser image,
then runs two fresh network-isolated containers with sandboxing and native CA
trust. It retains partial evidence on every outcome. Each job is bounded to
35 minutes and each repetition to ten minutes.

The disposable Ubuntu host must permit Chromium user namespaces. The runner
records the host's AppArmor user-namespace restriction, temporarily enables the
required namespaces, restores the original policy after execution, and verifies
restoration. The containers retain no Linux capabilities, external network
interface or host control socket. This workflow is for disposable qualification
hosts; it does not alter a deployed service host.

Download the resulting artifact to a new directory and verify it offline:

```sh
synthesis/node_modules/.bin/tsx synthesis/src/wallet-lab/native/verify.ts PATH_TO_BUNDLE
npm run verify:journals
```

A valid `qualification.json` binds the experimental result to the plan, source,
image, exact wallet/application artifacts and both raw records. Its
`qualifiedEnvironment` finding is separate from the wallet's vector outcomes.
Android, desktop HTTP and mixed Go/TypeScript closures require their own native
admission and qualification evidence.
