# Laboratory infrastructure

TPNIL uses one versioned execution protocol across local terminals, independent laboratories, and CI schedulers. GitHub Actions may request and display a run; it does not define the environment, hold the only evidence copy, or determine the result.

## ISI-1 synthesis profiles

The ISI-1 infrastructure is assembled from separately qualified profiles:

- `synthesis/` is the reference protocol workbench. It exercises PushDrop board records, CHIRP/UHRP content, LCH acquisition, overlay synchronization, replay, and negative cases in process.
- `profiles/teranode-regtest.json` pins the Teranode Quickstart source and every OCI image required by the controlled runtime. `scripts/prepare-teranode-runtime.mjs` creates a disposable, loopback-only Compose environment and a digest-bound runtime manifest.
- `plans/arcade-merkle-chaintracks-synthetic.json` qualifies Arcade, the pinned Merkle Service image, and embedded ChainTracks through the complete proof lifecycle using deterministic synthetic block data.
- `plans/arcade-real-teranode.json` qualifies direct Arcade submission and mining by the pinned Teranode runtime.
- `plans/arcade-real-teranode-merkle.json` joins those boundaries. Merkle Service consumes the exact native block and subtree objects from the live Teranode runtime, and the verifier checks the resulting proof against the actual block header root.
- `plans/arcade-synthesis-board-teranode-merkle.json` repeats the joined path with revision 3 of the real mined Synthesis Board PushDrop token and a separately mined fee input.
- `plans/arcade-uhrp-teranode-merkle.json` mines and proves the canonical signed UHRP advertisement for the board's CHIRP/LCH asset.
- `plans/arcade-lch-teranode-merkle.json` mines and proves the receipt-complete, two-payee BRC-170 settlement that unlocks the same asset.
- `plans/arcade-merkle-chaintracks-reorg.json` proves competing same-height headers, orphan-proof preservation, re-anchoring, and canonical reversion.
- `plans/arcade-merkle-reprocess-recovery.json` proves missed-callback recovery for ten watched transactions against immutable Merkle Service v0.6.0. Its declared adapter validates and converts the source fixture's legacy zero coinbase placeholder to the current canonical `0xff` representation before execution.
- `scripts/run-isi1-synthesis.mjs` starts a clean pinned runtime, executes and archives the Teranode qualification, derives each dependent signed transaction from the preceding result, runs the four Arcade/Teranode/Merkle stages, emits a joined result, and removes the runtime and volumes even on failure.

External-source plans run against a clean checkout at the declared commit. When an execution environment requires an adaptation, the plan names a patch under `adapters/`, binds its SHA-256 digest, and states its purpose. The component runner applies the patch only to a disposable `git archive`; the source checkout remains unchanged.

## Execution layers

1. **Control and evidence.** The repository validates the run plan, identifies every artifact, evaluates observations, writes content-addressed evidence, and verifies a retained bundle without network access.
2. **Portable service plane.** Application origins and controlled services run from pinned artifacts and OCI image digests. A profile can use a single host for development or equivalent isolated capacity under another scheduler. Docker Compose is the baseline topology format; Kubernetes is an optional capacity implementation.
3. **Native execution.** Desktop operating systems run in disposable virtual machines restored from a qualified base. Mobile applications run on declared simulators or physical devices as the artifact and vector require. Native guests have no repository or archive credential.
4. **Scheduling.** A local operator or GitHub Actions allocates the same profile and invokes the same controller. Official native jobs use single-job, ephemeral self-hosted runners or a broker that holds no SUT state between jobs.

## Reproduction contract

Every runnable profile identifies the controller revision, SUT digests, base image or device identity, operating-system and browser versions, dependency digests, logical origins, network policy, initial state, reset procedure, automation version, oracles, evidence destinations, and permitted semantic variation. Preparation-time acquisition is separate from run-time dependency closure.

The repository contains all TPNIL-owned provisioning and evaluation logic. Operators obtain third-party operating systems and proprietary SUTs through lawful channels and verify them against the declared digests. No independent operator requires access to P2PPSR infrastructure or credentials.

## First lanes

- `portable-webroot-1`: extracts and serves a submitted web-root artifact on loopback under its declared logical origin, checks the manifest and static dependency closure, repeats selected observations, and retains all response bodies with the artifact in an offline-verifiable bundle.
- `github-macos-arm64-1`: uses a clean GitHub-hosted Apple-silicon macOS virtual machine for native artifact admission and bridge qualification. The run records the observed hosted-image version because GitHub updates this capacity over time. Workflow artifacts are transferred into the repository-owned evidence format before their retention period expires.
- `macos-arm64-tart-1`: runs an unchanged production macOS wallet in a disposable Apple Virtualization guest. The base guest is pinned by registry digest, cloned for each run, and destroyed after evidence collection. Its network is restricted to the host service plane and explicitly declared acquisition endpoints during preparation.
- `chromium-extension-1`: runs the exact extension archive in a fresh Chromium persistent context, routes declared production service identities to isolated fixtures without changing extension bytes, blocks undeclared egress, and retains wallet, browser, service, and transaction observations.
- `android-avd-1`: creates the declared Android AVD from public SDK inputs, installs a digest-verified artifact or separately identified bundle derivative, drives public UI and WebView boundaries, and captures package, signer, device, runtime, screenshot, and DOM evidence.
- `github-android-kvm-1`: schedules `android-avd-1` on the repository-scoped `tpnil-android-qa` runner. The non-root pod has direct KVM allocation, a tokenless service account, and a digest-pinned runner image. Its cache is disposable capacity; repository plans and evidence verification remain authoritative.
- `isi4-metanet-wab-ump-controlled-services`: configures the admitted Metanet Explorer AAB through its ordinary setup UI, authenticates against the pinned WAB demo boundary, funds the WAB from a proof-carrying Teranode-mined coinbase, exercises root SLAP/SHIP and UMP discovery, and runs the canonical ToDo create, reload, and redemption sequence.

The portable lane qualifies the controller, archive, application artifact, and service-origin mechanics. The hosted macOS lane qualifies installation, ordinary first-use setup, renderer automation, local bridge observation, evidence capture, and teardown. Both produce `INFRASTRUCTURE_QUALIFICATION_ONLY`, never a SUT conformance verdict. The Tart lane remains the stable independent reconstruction target and must complete routing and reset qualification before scored native vectors run there.

The Chromium extension lane has issued the first `EXPERIMENTAL_CONFORMANCE_RESULT` for Yours Wallet 5.1.0. The Android lane currently retains an intake observation for Metanet Explorer and an engineering-only BSV Browser source-candidate observation. Claim type follows the admitted artifact and completed vector scope, not the scheduler that ran it.

## Commands

```sh
node bin/tpnil.mjs run-qualification \
  infra/plans/todo-webroot-qualification.json . out/todo-webroot-run local-operator
node bin/tpnil.mjs verify-qualification out/todo-webroot-run

node bin/tpnil.mjs archive-native-qualification \
  infra/plans/bsv-desktop-native-qualification.json downloaded-evidence out/native-run
node bin/tpnil.mjs verify-native-qualification out/native-run

node scripts/prepare-teranode-runtime.mjs \
  /path/to/teranode-quickstart-at-the-pinned-commit \
  out/teranode-regtest
docker compose --project-directory out/teranode-regtest up -d --pull never

node bin/tpnil.mjs run-component-qualification \
  infra/plans/arcade-real-teranode-merkle.json \
  /path/to/arcade-at-the-pinned-commit \
  out/arcade-teranode-merkle \
  independent-operator
node bin/tpnil.mjs verify-component-qualification out/arcade-teranode-merkle

node scripts/run-isi1-synthesis.mjs \
  out/teranode-regtest \
  /path/to/arcade-at-the-pinned-commit \
  out/isi1-synthesis-run \
  independent-operator
node bin/tpnil.mjs archive-synthesis-stack \
  out/isi1-synthesis-run \
  journals/synthesis-stack-qualification/<date>/<run>
node bin/tpnil.mjs verify-synthesis-stack \
  journals/synthesis-stack-qualification/<date>/<run>

./scripts/prepare-yours-wallet-run.sh
npm --prefix synthesis run wallet-lab -- run \
  ../infra/plans/isi4-yours-todo-controlled-services.json \
  ../out/isi4-yours \
  local-operator
npm --prefix synthesis run wallet-lab -- verify ../out/isi4-yours

npm --prefix synthesis run prepare:teranode-wallet-funding -- \
  ../out/teranode-regtest \
  ../fixtures/teranode/wab-funding-v1.json

./scripts/native/android/create-avd.sh TPNIL_API_35 35
./scripts/native/android/launch-emulator.sh TPNIL_API_35
npm run verify:journals
```

The resulting directories are portable evidence bundles. `record.json` binds the plan, observations, result, and raw evidence stored by SHA-256 under `objects/`. Portable web-root bundles retain the application artifact. Native bundles retain the release digest, size, publisher signature evidence, and all run observations; the large release artifact remains in the separately controlled artifact archive.

Runtime qualifications additionally bind the source pin, image index and platform digests, generated environment, observed services, transaction identifiers, assertions, and recovery result. Component qualifications retain the plan, external inputs, source revision, adapter identities, command output, runner metadata, and replayable assertion result.

Joined-stack qualifications also verify transaction ancestry and asset identity across funding, board revision, UHRP advertisement, and LCH settlement. Their verifier recursively verifies the runtime and component bundles before accepting the aggregate result.
