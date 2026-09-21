# Implementation status

| Capability | Laboratory 0.5.0 |
| --- | --- |
| Reproducible compiled-webroot packaging | Implemented with fixed archive metadata; Python standard library |
| Strict JSON contract validation, digest verification, deterministic equality oracle | Implemented for laboratory self-tests |
| Content-addressed objects, hash-linked local journal, replay, prefix comparison | Implemented; not a distributed transparency service |
| Portable laboratory qualification execution | Implemented for canonical web-root extraction, logical-origin serving, HTTP assertions, raw evidence retention, and offline verification |
| Native macOS qualification execution | Implemented on clean hosted Apple-silicon macOS VMs; two retained BSV Desktop repetitions pass installation, initialization, mainnet-mode, and local BRC-100 bridge assertions |
| ISI requirement catalogs and machine-readable vector plans | Four versioned catalogs; ISI-4 V001–V006 are executable for conforming drivers, while V007–V008 retain explicit blockers |
| Four ISI reports on admitted SUTs | First ISI-4 experimental result retained; ISI-1, ISI-2, and ISI-3 SUT reports remain pending |
| Teranode regtest closure and mining | Implemented with pinned source and image digests; real PushDrop post and revision spends, conflict rejection, deterministic mining, retrieval, and full-stack restart recovery retain passing evidence |
| Arcade/Merkle/ChainTracks lifecycle | Implemented against pinned Arcade source and Merkle image; synthetic-block qualification proves registration, callbacks, header tracking, and proof roots |
| Joined Arcade/Teranode/Merkle path | Implemented as one dependency-linked chain: controlled funding, actual revision 3 of the mined Synthesis Board PushDrop token, canonical UHRP advertisement, and receipt-complete two-payee BRC-170 LCH settlement. Every stage passed through Arcade and pinned Teranode and received a Merkle proof matching the native block-header root |
| Joined-stack orchestration | Implemented; one command creates and archives runtime evidence, derives four dependent fixtures, generates digest-locked plans, runs each qualification, emits an aggregate result, and tears down the stack. Two clean retained runs pass recursive offline verification |
| Fault and recovery profiles | Implemented for full Compose restart, CHIRP host outage/corruption, overlay replay, competing ChainTracks branches with orphan/re-anchor/revert behavior, and missed-callback `/reprocess` recovery for ten watched transactions |
| Overlay HTTP driver and independent state oracle | Implemented in the reference profile for submission, lookup, convergence, revision, conflict rejection, and journal replay; external overlay SUT qualification remains pending |
| Remote storage HTTP driver and state oracle | Contract specified; implementation pending |
| iOS/Android/Windows/Linux binary installation and automation | macOS and Android capacity implemented; Android supports a local AVD and repository-scoped KVM runner. iOS, Windows, and native Linux profiles remain pending |
| Canonical compiled ToDo tarball | Retained from `p2ppsr/todo-ts` revision `236733c586c4d2cc3ab7f957afa382005509acd4` at SHA-256 `b3c41dc60ba99b497231008a15033a60110cc7cd60b2d4fffd405e33f4979ddc`; deterministic preparation and application serving are executable |
| Production-fidelity intake | Implemented record validation, evidence and artifact digest checks, and explicit readiness reporting |
| BSV Desktop 2.8.5 intake | Exact macOS arm64 DMG installed twice on clean VMs; signature, Gatekeeper, first-use initialization, mainnet response, authentication, and local bridge version verified; service coverage and fixture state remain unresolved |
| Yours Wallet 5.1.0 | Exact public Chromium artifact admitted and executed twice with fresh identities and isolated controlled services; V001–V004 pass, V005–V006 fail, V007–V008 are blocked, and both semantic projections match |
| Metanet Explorer 1.1.10 | Exact publisher AAB admitted through a separately identified laboratory-signed universal APK. Four controlled-WAB Android runs completed ordinary account activation, a Teranode-funded faucet payment, and UMP publication; each submitted a seven-satoshi ToDo output, but the WebView timed out waiting for the native wallet response and the task remained in its create dialog. The fourth run recorded all 19 storage HTTP requests completing, including the final action calls. Discovery, reload, redemption, and full conformance remain unproven. |
| BSV Browser 1.6.1 | Source-pinned engineering build creates an authenticated mainnet wallet, exposes 28 BRC-100 methods, and reaches the ToDo funding boundary; no production result is issued without a publisher binary |
| ISI-4 controlled-service mainnet-wallet execution | Implemented for the Yours Wallet Chromium profile with isolated Wallet Storage, transaction submission, header/proof, application, funding, reset, and independent transaction oracles; remaining wallet profiles preserve their own blockers |
| Android scheduling | Reproducible local AVD plus a repository-scoped KVM GitHub Actions runner using a digest-pinned non-root image and tokenless service account; workflow evidence is verified by repository code |
| ISI-1 UHRP/CHIRP/LCH synthesis | Retained reference qualification passes signed PushDrop board creation and revision, canonical UHRP advertisement tokens and HTTP lookup, expiry/revocation/replay, two-host CHIRP availability and corruption handling, LCH payment/decryption, board overlay synchronization, and restart replay; imported standard corpora and negative cases also pass |
| Complete Synthesis Board SUT run | The reference protocol and causally joined transaction infrastructure are qualified. A scored SUT result still requires the packaged browser application and an admitted external BRC-100 wallet to create the same transaction graph through their public interfaces, followed by the required repetitions and report |
| GitHub enforced private branch protection | Unavailable on the current private-repository account plan |
| Signing, independent journal checkpoints, mirrors, certification marks | Not established |

The self-test core produces `LAB_SELF_TEST_ONLY` results. Infrastructure runs produce `INFRASTRUCTURE_QUALIFICATION_ONLY` results. Intake review produces `INTAKE_REVIEW_ONLY` readiness reports. The Yours Wallet record is an `EXPERIMENTAL_CONFORMANCE_RESULT`; it is not certification. Certification remains unavailable.

[Synthesis baseline research](research/synthesis-baseline.md) records the standards and implementation pins. [ISI-1 decision 0001](../programs/ISI-1/decisions/0001-layered-synthesis.md) defines the qualification staircase; [decision 0002](../programs/ISI-1/decisions/0002-executable-profiles.md) records the executable profiles and their evidence boundary.

The infrastructure architecture and first portable lane are implemented under [ISI-4 decision 0003](../programs/ISI-4/decisions/0003-hybrid-laboratory.md). [Decision 0004](../programs/ISI-4/decisions/0004-native-qualification-lanes.md) admits the hosted macOS lane for infrastructure qualification. [Decision 0005](../programs/ISI-4/decisions/0005-multi-wallet-execution.md) records the Chromium and Android execution boundary, the first scored result, and the remaining per-wallet blockers.

[ISI-4 decision 0007](../programs/ISI-4/decisions/0007-controlled-wallet-bridge-observation.md) records the bounded native-bridge and storage diagnostic boundaries and four retained Android trials.
