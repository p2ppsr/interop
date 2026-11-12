# Transaction Processing Network Interoperability Laboratory

**TPNIL** is a BSV Blockchain initiative for impartial interoperability evaluation, without fear or favor. The laboratory brings published requirements, canonical software artifacts, integrated test environments, deterministic results, and durable evidence into a common framework open to equal participation.

**Version 0.5.0 — public experimental release.** The laboratory executes the causally joined transaction-processing reference stack and an admitted production-wallet BRC-100 lane. The latest two clean Yours Wallet 5.1.0 repetitions on the Go-backed ITCVE-1 2.0.0 profile match: V001–V007 pass and V008 fails, with 180 PASS, 99 FAIL and one BLOCKED predicate each. [Native findings and retained workflow boundaries](docs/native-conformance-results-2026-11-09.md) distinguish environment admission, remaining wallet findings and the separately qualified Rust3 reevaluation: 77 integration and 48 Rust checks pass per repetition on the unchanged native observations. The component-only ITCVE-1 3.0.0 profile independently records 584 PASS and six unchanged Go Message Box FAIL observations across 590 assertions. Four controlled-WAB Metanet Explorer runs completed activation, mined-output funding and UMP publication, then submitted a ToDo token; each stopped at the WebView wallet-response and task-visibility boundary. A BSV Browser source candidate reached an authenticated 28-method BRC-100 context and the ToDo funding boundary. These are experimental results and engineering observations. Certification remains unavailable. [Implementation status](docs/implementation-status.md) records the exact boundary.

## The laboratory

The [charter](CHARTER.md) defines the mission and principles. [Governance](GOVERNANCE.md) describes stewardship, technical decisions and result review. Original materials use [Apache-2.0](LICENSE.md), with [third-party exceptions](THIRD_PARTY_NOTICES.md). Public results require exact artifacts and reproduction materials that anyone may use, retain and mirror for non-commercial TPNIL-related reproduction, education, research and other connected activity. Proprietary submission permissions exclude resale and unrelated use or redistribution. Proprietary software may participate under the [submission terms](legal/ARTIFACT-SUBMISSION-AGREEMENT.md) and [intake process](suts/README.md).

| Program | Scope | Version | Status |
| --- | --- | --- | --- |
| [ISI-1](programs/ISI-1/0.1.0/README.md) | Complete transaction-processing stack integration | 0.1.0 | Draft |
| [ISI-2](programs/ISI-2/0.1.0/README.md) | Overlay synchronization, submission, and lookup | 0.1.0 | Draft |
| [ISI-3](programs/ISI-3/0.1.0/README.md) | Remote wallet storage boundary and mediated synchronization | 0.1.0 | Draft |
| [ISI-4](programs/ISI-4/4.0.0/README.md) | Production BRC-100 wallet and application interoperability | 4.0.0 | Draft |
| [ISI-5](programs/ISI-5/0.1.0/README.md) | Multicast transaction and object delivery | 0.1.0 | Draft |

ISI-1 through ISI-4 select versioned ITCVE-1 profiles. The latest ISI-4 lane uses the [native decision and shutdown profile](itcves/ITCVE-1/2.0.0/README.md); its [original production-wallet profile](itcves/ITCVE-1/1.0.0/README.md) remains separately reproducible; ISI-1 through ISI-3 retain [version 0.1.0](itcves/ITCVE-1/0.1.0/README.md). ISI-1 defines the integrated foundation; ISI-2 through ISI-4 evaluate narrower profiles within it. ISI-5 selects [ITCVE-2](itcves/ITCVE-2/0.1.0/README.md), which places a multicast delivery fabric between the same transaction-processing services. Results are specific to the executed profile and artifact combination.

[BSV Desktop 2.8.5](suts/intake/bsv-desktop-2.8.5.md) remains the reference desktop wallet candidate. [Yours Wallet 5.1.0](suts/intake/yours-wallet-5.1.0.md) is the first wallet with a retained experimental result. [Metanet Explorer 1.1.10](suts/intake/metanet-explorer-1.1.10-android.md) has a qualified Android artifact, four controlled-WAB native observations and an unresolved ToDo response boundary. [BSV Browser 1.6.1](suts/candidates/bsv-browser-1.6.1-source-candidate.md) has engineering evidence but awaits a publisher binary for admission. The canonical application artifact is the deterministic compiled `p2ppsr/todo-ts` web-root archive under `fixtures/artifacts/`.

The transaction-submission role uses [BSV Broadcaster](https://github.com/bsv-blockchain/broadcaster). Current documentation uses that project name; retained evidence, source pins and artifact identifiers preserve their original byte identity.

## Run the offline core

Use the Node.js version pinned in `.nvmrc` and Python 3. The core needs no npm dependencies or external services:

```sh
npm test
npm run check
npm run qualify:standards
npm run verify:journals
npm run demo
node bin/tpnil.mjs verify out/demo
node bin/tpnil.mjs replay out/demo
```

The demo creates a synthetic `LAB_SELF_TEST_ONLY` result in a fresh `out/demo` directory. For another run, use `node bin/tpnil.mjs demo out/another-run`. Standards qualification verifies the pinned BRC-167/BRC-170 corpora and independently recomputes core invariants; it also produces a laboratory self-test, not SUT conformance.

Journal verification checks the retained intake, portable, native, component, runtime, reference and wallet-run evidence without executing the original SUTs. The [operator guide](docs/operator-quickstart.md) covers focused verification, artifact hashing, packaging and recovery.

## Synthesis and wallet execution

Synthesis checks install the locked dependencies and require access to the package registry:

```sh
npm run test:synthesis
```

Wallet and native execution additionally require the selected profile's binaries, prepared environment and controlled services. Follow the [wallet execution instructions](docs/operator-quickstart.md#wallet-execution) and [laboratory infrastructure guide](infra/README.md). Infrastructure qualification, the synthesis reference profile and a SUT result retain their distinct claims; [implementation status](docs/implementation-status.md) identifies the current coverage.

[Payment journeys](docs/payment-journeys.md) add pinned PeerPay and Mountaintops
source regressions and a proposed native send/receive coverage matrix. Native
payment outcomes require separate execution and evidence.

## Documentation and repository map

- [Conformance model](docs/conformance-model.md), [determinism](docs/determinism.md), and [evidence policy](docs/evidence.md) define evaluation and reporting.
- [Architecture](docs/architecture.md), [adapter contract](adapters/README.md), and [schemas](schemas/README.md) define laboratory interfaces.
- [Source research](docs/research/landscape.md), [synthesis baseline](docs/research/synthesis-baseline.md), [decision register](docs/decisions.md), and [roadmap](ROADMAP.md) connect the foundation to its next qualification stages.
- [Participation](CONTRIBUTING.md) explains submissions and technical contributions.

`programs/` holds versioned requirements and vector catalogs; `itcves/` defines environment profiles; `infra/` contains runnable laboratory plans and provisioning contracts; `schemas/` holds machine-readable contracts; `src/` and `bin/` implement the offline core; `adapters/` specifies the control plane; `suts/` records artifact candidates; `fixtures/` contains laboratory self-tests; `journals/` retains accepted evidence; and `docs/` contains technical policies and research.

ITCVE-1 supports independently selectable Go Overlay Services, Go ChainTracks and
Go Wallet Storage through the [1.1.0 engineering component profile](itcves/ITCVE-1/1.1.0/README.md).

The [1.2.0 native qualification](itcves/ITCVE-1/1.2.0/README.md) admits the
unchanged Yours Wallet 5.1.0 Chromium extension on the all-Go Linux/amd64 closure.
Two clean native repetitions match: V001–V004 PASS, V005–V006 FAIL and V007–V008
BLOCKED, with mined funding ancestry and actual redemption verified offline.

[ITCVE-1 1.3.0](itcves/ITCVE-1/1.3.0/README.md) adds the integrated component
runner: TS/Go Message Box and discovery, mediated storage replacement, actual
TS/Go overlay synchronization, ChainTracks, Identity Services, Wallet Relay,
paid HTTP and an independent Rust participant. Its separate native profile
connects these services to the unchanged wallet's public API and the
Board/UHRP/CHIRP/LCH graph, retaining raw observations, explicit adapters,
failure findings and offline verification.

The [integrated results report](docs/integrated-lab-results-2026-11-06.md)
records executed lanes, native attempts, original CI archives and reproduction
commands.

[ITCVE-1 1.5.0](itcves/ITCVE-1/1.5.0/README.md) adds separately frozen native
conformance criteria: visible category permissions and revocation, rejected-action
recovery, source-off counterpart replacement with complete descendant ancestry,
and a source-linked clause corpus. The [November 9 results report](docs/native-conformance-results-2026-11-09.md)
retains each failed attempt, engineering preflight and component qualification.
Its Linux run retains matching portability results but differing permission
observations and does not qualify. [ITCVE-1 2.0.0](itcves/ITCVE-1/2.0.0/README.md)
separately introduces trusted click capture and shutdown-final submission
evidence. Both native repetitions pass base admission and V001–V007; V008
retains 99 FAIL and one BLOCKED. The separately qualified Rust3 retained-evidence
reevaluation passes 48/48 checks per repetition without another wallet session.
Complete BRC-100 conformance remains unproven. Historical profiles and findings
remain unchanged.
