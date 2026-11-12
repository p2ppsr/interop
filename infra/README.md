# Laboratory infrastructure

TPNIL uses one versioned execution protocol across local terminals, independent laboratories, and CI schedulers. GitHub Actions may request and display a run; it does not define the environment, hold the only evidence copy, or determine the result.

## ISI-1 synthesis profiles

The ISI-1 infrastructure is assembled from separately qualified profiles:

- `synthesis/` is the reference protocol workbench. It exercises PushDrop board records, CHIRP/UHRP content, LCH acquisition, overlay synchronization, replay, and negative cases in process.
- `profiles/teranode-regtest.json` pins the Teranode Quickstart source and every OCI image required by the controlled runtime. `scripts/prepare-teranode-runtime.mjs` creates a disposable, loopback-only Compose environment and a digest-bound runtime manifest.
- `plans/arcade-merkle-chaintracks-synthetic.json` qualifies Broadcaster, the pinned Merkle Service image, and embedded ChainTracks through the complete proof lifecycle using deterministic synthetic block data.
- `plans/arcade-real-teranode.json` qualifies direct Broadcaster submission and mining by the pinned Teranode runtime.
- `plans/arcade-real-teranode-merkle.json` joins those boundaries. Merkle Service consumes the exact native block and subtree objects from the live Teranode runtime, and the verifier checks the resulting proof against the actual block header root.
- `plans/arcade-synthesis-board-teranode-merkle.json` repeats the joined path with revision 3 of the real mined Synthesis Board PushDrop token and a separately mined fee input.
- `plans/arcade-uhrp-teranode-merkle.json` mines and proves the canonical signed UHRP advertisement for the board's CHIRP/LCH asset.
- `plans/arcade-lch-teranode-merkle.json` mines and proves the receipt-complete, two-payee BRC-170 settlement that unlocks the same asset.
- `plans/arcade-merkle-chaintracks-reorg.json` proves competing same-height headers, orphan-proof preservation, re-anchoring, and canonical reversion.
- `plans/arcade-merkle-reprocess-recovery.json` proves missed-callback recovery for ten watched transactions against immutable Merkle Service v0.6.0. Its declared adapter validates and converts the source fixture's legacy zero coinbase placeholder to the current canonical `0xff` representation before execution.
- `scripts/run-isi1-synthesis.mjs` starts a clean pinned runtime, executes and archives the Teranode qualification, derives each dependent signed transaction from the preceding result, runs the four Broadcaster/Teranode/Merkle stages, emits a joined result, and removes the runtime and volumes even on failure.

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

## Selectable Go components

The [ITCVE-1 1.1.0 component profile](../itcves/ITCVE-1/1.1.0/README.md)
connects real Go Overlay Services, ChainTracks and authenticated Wallet Storage
to the controlled TypeScript service plane. Run `npm run test:go` for all eight
implementation combinations and fault/recovery checks. The wallet CLI, desktop
controlled fixture and Android service host accept explicit component selections.

The [native all-Go wallet protocol](../itcves/ITCVE-1/1.2.0/README.md) adds a
separate Linux/amd64 admission gate for Yours Wallet 5.1.0: exact executed
archives, fresh isolated containers, native Chromium sandbox and CA trust,
Teranode-mined funding ancestry, independent transaction/state oracles and two
matching repetitions. Use `profile=all-go-native` in the manual Yours workflow.
The 1.1.0 engineering CLI does not issue this qualification by itself.

## ITCVE-2 component qualifications

These plans qualify the `harness` configuration of
[ITCVE-2](../itcves/ITCVE-2/0.1.0/README.md) for
[ISI-5](../programs/ISI-5/0.1.0/README.md). Results are
`INFRASTRUCTURE_QUALIFICATION_ONLY`; they are not throughput measurements.

### Harness plans

Each `multicast-fabric-*` plan runs the `harness-qualify run` command of
[`lightwebinc/multicast-test`](https://github.com/lightwebinc/multicast-test)
at commit `8e553bf81e55484dfb10431ae1e7da63f061dd3c`. The command verifies the
closure in
[`tpnil/components.lock.json`](https://github.com/lightwebinc/multicast-test/blob/8e553bf81e55484dfb10431ae1e7da63f061dd3c/tpnil/components.lock.json),
compiles every image from the pinned sources, and runs the selected scenarios.
The distroless base of each compiled image resolves by its tag at build time. A
plan requires one `--- PASS:` line per scenario, so a skipped scenario fails the
plan.

| Plan | ISI-5 | Standards | Scenarios |
| --- | --- | --- | --- |
| `multicast-fabric-tx-frames.json` | V001 | BRC-124, BRC-128, BRC-129 | Delivery to every subscribed shard, shard filtering, Extended Format carriage, mixed formats, payload hash identity |
| `multicast-fabric-tx-filters.json` | V001 | BRC-124, BRC-127, BRC-129 | Subtree filtering, an egress bridge that re-maps groups, dynamic filtering from subtree group announcements |
| `multicast-fabric-tx-dedup.json` | V001 | BRC-124 | Deduplication by transaction identifier across listeners, a collision, failure of the shared cache (fail open), cache failover |
| `multicast-fabric-ssm.json` | V001 | BRC-129 | Source-specific joins and leaves, the any-source fallback |
| `multicast-fabric-tx-fragmentation.json` | V002 | BRC-130 | Fragmented delivery, filtering, hash verification, loss and abandonment |
| `multicast-fabric-tx-repair.json` | V003 | BRC-126 | NACK with Extended Format payloads, ACK, MISS, recovery identities, end-to-end repair |
| `multicast-fabric-tx-rate-limits.json` | V003 | BRC-126 | Burst gaps under rate limits, MISS escalation by tier, multi-endpoint, per-chain and per-group limits |
| `multicast-fabric-tx-repair-topologies.json` | V003 | BRC-126 | Repair fed by a listener tee without a group join, NACK proxying across domains, repair between fabrics |
| `multicast-fabric-block-objects.json` | V004 | BRC-131, BRC-132, BRC-134, BRC-135, BRC-144 | Block announcement, subtree data, anchor frames, the header lane, fragment-level recovery |
| `multicast-fabric-beef-plane.json` | V005 | BRC-148, BRC-149 | BEEF object submission and delivery, topic and version filtering, verbatim carriage, fragmentation and recovery, domain coordination, plane independence, multi-topic records |
| `multicast-fabric-tx-bundles.json` | V006 | BRC-142 | Coalescing, decoalescing, bundle-unit recovery, re-bucketing |
| `multicast-fabric-manifest.json` | V006 | BRC-139 | Manifest pipeline, successor signal, adoption safety gates |

Prepare once, then run and verify any plan:

```sh
git clone https://github.com/lightwebinc/multicast-test.git ws/multicast-test
git -C ws/multicast-test checkout 8e553bf81e55484dfb10431ae1e7da63f061dd3c
(cd ws/multicast-test && go run ./tpnil/cmd/harness-qualify prepare)
node bin/tpnil.mjs run-component-qualification \
  infra/plans/multicast-fabric-tx-frames.json ws/multicast-test \
  out/multicast-fabric-tx-frames independent-operator
node bin/tpnil.mjs verify-component-qualification out/multicast-fabric-tx-frames
```

Requirements: Linux/amd64, Docker, Go 1.27.3 and passwordless `sudo`, because
the scenarios create network namespaces.

### Frame conformance vectors

The `multicast-frame-vectors-*` plans (ISI-5 V007) check the corpus
[`tpnil/vectors/multicast-frames-v1.json`](https://github.com/lightwebinc/multicast-test/blob/388f3e2d40df157ff8c75050b7e7f0a88a5365f3/tpnil/vectors/multicast-frames-v1.json)
at multicast-test commit `388f3e2d40df157ff8c75050b7e7f0a88a5365f3`, pinned to
BRCs commit `99ee33ea5980313a5c2b01a02a1e42569d981fd6`. It holds ten vectors
for BRC-124, BRC-128 to BRC-130, BRC-135, BRC-148 and BRC-149, built from a
real Extended Format transaction, Atomic BEEF object and block header, and
seven inputs every decoder must reject. Each plan names the corpus as a
digest-bound input, and the two oracles share no code:

| Plan | Oracle |
| --- | --- |
| `multicast-frame-vectors-reference.json` | The released shard-common decoders, in Go |
| `multicast-frame-vectors-independent.json` | A verifier written from the BRC text alone with Node.js built-ins, which recomputes SHA-256, SHA-256d, XXH64, group indices and RFC 5952 addresses |

They need a clean clone at that commit and no Docker; the reference oracle
needs Go 1.27.3.

### BRC-22 submit boundary

`overlay-brc22-submit-boundary-go.json` (ISI-5 V012) runs
[`tests/tpnil/brc22`](https://github.com/lightwebinc/overlay-bridge/tree/2bf3faca12c0b2b25ff3b941083cea2e529f1fca/tests/tpnil/brc22)
in `lightwebinc/overlay-bridge` against go-overlay-services v1.3.8. It names the
[BRC-22 submit boundary vectors](../programs/ISI-5/proposals/brc22-submit-boundary/0.1.0/README.md)
as a digest-bound input through `${LAB_ROOT}`, so it runs from this repository.
It needs Go 1.27.3 and no Docker:

```sh
git clone https://github.com/lightwebinc/overlay-bridge.git ws/overlay-bridge
git -C ws/overlay-bridge checkout 2bf3faca12c0b2b25ff3b941083cea2e529f1fca
node bin/tpnil.mjs run-component-qualification \
  infra/plans/overlay-brc22-submit-boundary-go.json ws/overlay-bridge \
  out/overlay-brc22-submit-boundary-go independent-operator
```

### Joined plans

The `joined` configuration of ITCVE-2 runs from
[`tpnil/joined`](https://github.com/lightwebinc/multicast-test/tree/4b150b526236b5ad2ad7e80e1c3efdb9ea67683b/tpnil/joined) in `lightwebinc/multicast-test` at commit
`4b150b526236b5ad2ad7e80e1c3efdb9ea67683b`. Its fixtures come from the run's own regtest chain, so `qualify.sh`
writes the plans for each run, names the fixtures as digest-bound inputs, runs
them with this repository's runner and verifies every bundle offline. Each
journal retains its plan.

| Plan | ISI-5 | Source | What it requires |
| --- | --- | --- | --- |
| `ISI5-JOINED-PORTABLE-ARCADE-TERANODE-MERKLE` | V008, V009, ready condition | arcade-bridge | Broadcaster's only datahub is the facade; a transaction reaches Teranode through the fabric and is mined; a capture of the transaction lane on the fabric network holds exactly the fixture's Extended Format bytes; the subtree and block the proof bridge serves Merkle Service, which it holds only from its lanes, equal the processor's bytes; the block's objects reach Merkle Service through the fabric only; Broadcaster's proof matches the block header |
| `ISI5-JOINED-PORTABLE-V010-REPAIR-UNDER-LOSS` | V010 | multicast-test | After a lossless warmup, under a declared loss on IPv6 UDP into the delivery edge and through a lossless trailer, every gap is detected and repaired or reported, each transaction crosses its lane once, and the submission and proof paths complete |
| `ISI5-JOINED-PORTABLE-V011-OVERLAY-DELIVERY` | V011 | overlay-bridge | An object submitted to one host is delivered over the BEEF object plane and admitted by the other; both hosts answer the same lookup; a repeat creates no second admission |
| `ISI5-JOINED-PORTABLE-STANDING-RESTORE` | Restore condition | arcade-bridge | Broadcaster's discovery and Merkle Service's own libp2p source return |

```sh
git clone https://github.com/lightwebinc/multicast-test.git ws/multicast-test
git -C ws/multicast-test checkout 4b150b526236b5ad2ad7e80e1c3efdb9ea67683b
cd ws/multicast-test
tpnil/joined/processor/up.sh "$WORK"
tpnil/joined/broadcaster/up.sh standing "$WORK"
tpnil/joined/fabric/up.sh "$WORK"
tpnil/joined/overlay/up.sh "$WORK"
RUNNER_ID=independent-operator \
MULTICAST_TEST_COMMIT=4b150b526236b5ad2ad7e80e1c3efdb9ea67683b \
OVERLAY_BRIDGE_COMMIT=56c030a707251ef5f5cae8fd83e63274f49bb932 \
  tpnil/joined/qualify.sh "$WORK"
```

Requirements: Linux/amd64, Docker with Compose, `tcpdump`, about 12 GB of free
memory, passwordless `sudo` (V010 applies its loss with `tc`, and the joined
path captures the transaction lane with `tcpdump`), Node.js 24 and Go 1.27.3.

### Delivery-edge repair

`multicast-listener-nack-repair.json` (ISI-5 V010) runs the gap tracker's tests
in [shard-listener](https://github.com/lightwebinc/shard-listener) v1.36.1,
commit `dc8a54d288d5726f7ab3092492ad076a47064096`. They cover the clauses V010 relies on: a burst lost from one
sender is registered and NACKed whole rather than read as an emitter change
(BRC-124 SeqNum, BRC-126 gap detection); an ACK without the unicast flag does
not close a gap, which is asked for again until its frame arrives or it is
reported unrecovered (BRC-126 ACK Response, repair confirmation); a tail probe
answered by an ACK is booked once; and the pending table is bounded per flow
and across flows, with every refused gap reported unrecovered. It needs Go
1.27.3 and no Docker:

```sh
git clone https://github.com/lightwebinc/shard-listener.git ws/shard-listener
git -C ws/shard-listener checkout dc8a54d288d5726f7ab3092492ad076a47064096
node bin/tpnil.mjs run-component-qualification \
  infra/plans/multicast-listener-nack-repair.json ws/shard-listener \
  out/multicast-listener-nack-repair independent-operator
```
