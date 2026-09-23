# Transaction Processing Network Interoperability Laboratory

**TPNIL** is a BSV Blockchain initiative for impartial interoperability evaluation, without fear or favor. The laboratory brings published requirements, canonical software artifacts, integrated test environments, deterministic results, and durable evidence into a common framework open to equal participation.

**Version 0.5.0 — private establishment phase, experimental.** The laboratory executes the causally joined transaction-processing reference stack and an admitted production-wallet BRC-100 lane. Two clean Yours Wallet 5.1.0 repetitions produced the same semantic result: V001–V004 passed, V005–V006 failed, and V007–V008 were blocked. Four controlled-WAB Metanet Explorer runs completed activation, mined-output funding and UMP publication, then submitted a ToDo token; each stopped at the WebView wallet-response and task-visibility boundary. A BSV Browser source candidate reached an authenticated 28-method BRC-100 context and the ToDo funding boundary. These are experimental results and engineering observations. Certification remains unavailable. [Implementation status](docs/implementation-status.md) records the exact boundary.

## The laboratory

The [charter](CHARTER.md) defines the mission and principles. [Governance](GOVERNANCE.md) establishes founding stewardship, participation, decision-making, and the transition to multi-stakeholder operation. Original materials use the [Open BSV licensing policy](LICENSE.md); proprietary software may participate under the [common admission terms](suts/README.md).

| Program | Scope | Version | Status |
| --- | --- | --- | --- |
| [ISI-1](programs/ISI-1/0.1.0/README.md) | Complete transaction-processing stack integration | 0.1.0 | Draft |
| [ISI-2](programs/ISI-2/0.1.0/README.md) | Overlay synchronization, submission, and lookup | 0.1.0 | Draft |
| [ISI-3](programs/ISI-3/0.1.0/README.md) | Remote wallet storage boundary and mediated synchronization | 0.1.0 | Draft |
| [ISI-4](programs/ISI-4/1.0.0/README.md) | Production BRC-100 wallet and application interoperability | 1.0.0 | Draft |

All four programs select versioned ITCVE-1 profiles. ISI-4 uses the [production-wallet controlled-service profile](itcves/ITCVE-1/1.0.0/README.md); ISI-1 through ISI-3 retain [version 0.1.0](itcves/ITCVE-1/0.1.0/README.md). ISI-1 defines the integrated foundation; the other programs evaluate narrower profiles within it. Results are specific to the executed profile and artifact combination.

[BSV Desktop 2.8.5](suts/intake/bsv-desktop-2.8.5.md) remains the reference desktop wallet candidate. [Yours Wallet 5.1.0](suts/intake/yours-wallet-5.1.0.md) is the first wallet with a retained experimental result. [Metanet Explorer 1.1.10](suts/intake/metanet-explorer-1.1.10-android.md) has a qualified Android artifact, four controlled-WAB native observations and an unresolved ToDo response boundary. [BSV Browser 1.6.1](suts/candidates/bsv-browser-1.6.1-source-candidate.md) has engineering evidence but awaits a publisher binary for admission. The canonical application artifact is the deterministic compiled `p2ppsr/todo-ts` web-root archive under `fixtures/artifacts/`.

## Run the offline core

Use Node.js 24.7.0 or later; `.nvmrc` pins the CI runtime. These commands require no package installation or external services:

```sh
npm test
npm run check
npm run qualify:standards
npm run demo
node bin/tpnil.mjs verify out/demo
node bin/tpnil.mjs replay out/demo
node bin/tpnil.mjs run-qualification infra/plans/todo-webroot-qualification.json . out/todo-webroot-run local-operator
node bin/tpnil.mjs verify-qualification out/todo-webroot-run
node bin/tpnil.mjs verify-native-qualification journals/native-qualification/2026-09-20/bsv-desktop-2.8.5-macos-arm64-35533034148
node bin/tpnil.mjs verify-runtime-qualification journals/runtime-qualification/2026-09-20/teranode-synthesis-board-v0.15.9-arm64
node bin/tpnil.mjs verify-reference-qualification journals/reference-qualification/2026-09-20/synthesis-board-v0.1.0
node bin/tpnil.mjs verify-component-qualification journals/component-qualification/2026-09-20/arcade-real-teranode-merkle
node bin/tpnil.mjs verify-component-qualification journals/component-qualification/2026-09-20/arcade-synthesis-board-teranode-merkle
node bin/tpnil.mjs verify-component-qualification journals/component-qualification/2026-09-20/arcade-merkle-reprocess-recovery
node bin/tpnil.mjs verify-synthesis-stack journals/synthesis-stack-qualification/2026-09-20/repetition-3
npm run test:synthesis
npm run verify:journals
./scripts/prepare-yours-wallet-run.sh
npm --prefix synthesis run wallet-lab -- run ../infra/plans/isi4-yours-todo-controlled-services.json ../out/isi4-yours local-operator
```

The demo performs a synthetic laboratory self-test, writes a content-addressed result and hash-linked journal to `out/demo`, and verifies repeatability. `npm run qualify:standards` verifies the exact imported BRC-167 and BRC-170 corpora and independently recomputes core CHIRP and LCH invariants. Both carry the `LAB_SELF_TEST_ONLY` designation. Each demo run requires a fresh output directory; for subsequent runs use `node bin/tpnil.mjs demo out/another-run`.

The qualification commands execute the canonical application-serving test stand and verify retained native, component, runtime, reference-profile, and joined-stack evidence. Infrastructure bundles do not issue SUT conformance. The synthesis package labels its result `LAB_REFERENCE_PROFILE_ONLY`. [Laboratory infrastructure](infra/README.md) defines the reproducible profiles, the one-command joined-stack runner, and their claim boundaries.

The [operator guide](docs/operator-quickstart.md) covers artifact hashing, compiled web-root packaging, evidence verification, and journal recovery.

## Documentation and repository map

- [Conformance model](docs/conformance-model.md), [determinism](docs/determinism.md), and [evidence policy](docs/evidence.md) define evaluation and reporting.
- [Architecture](docs/architecture.md), [adapter contract](adapters/README.md), and [schemas](schemas/README.md) define laboratory interfaces.
- [Source research](docs/research/landscape.md), [synthesis baseline](docs/research/synthesis-baseline.md), [decision register](docs/decisions.md), and [roadmap](ROADMAP.md) connect the foundation to its next qualification stages.
- [Participation](CONTRIBUTING.md) explains submissions and technical contributions.

`programs/` holds versioned requirements and vector catalogs; `itcves/` defines environment profiles; `infra/` contains runnable laboratory plans and provisioning contracts; `schemas/` holds machine-readable contracts; `src/` and `bin/` implement the offline core; `adapters/` specifies the control plane; `suts/` records artifact candidates; `fixtures/` contains laboratory self-tests; `journals/` retains accepted evidence; and `docs/` contains technical policies and research.
