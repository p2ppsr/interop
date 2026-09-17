# Transaction Processing Network Interoperability Laboratory

**TPNIL** is a BSV Blockchain initiative for impartial interoperability evaluation, without fear or favor. The laboratory brings published requirements, canonical software artifacts, integrated test environments, deterministic results, and durable evidence into a common framework open to equal participation.

**Version 0.1.0 — private establishment phase, experimental.** The offline core and journal verifier are implemented. Four draft programs define the scope of evaluation; SUT adapters and native test environments are under development. [Implementation status](docs/implementation-status.md) records current capabilities and qualification prerequisites.

## The laboratory

The [charter](CHARTER.md) defines the mission and principles. [Governance](GOVERNANCE.md) establishes founding stewardship, participation, decision-making, and the transition to multi-stakeholder operation. Original materials use the [Open BSV licensing policy](LICENSE.md); proprietary software may participate under the [common admission terms](suts/README.md).

| Program | Scope | Version | Status |
| --- | --- | --- | --- |
| [ISI-1](programs/ISI-1/0.1.0/README.md) | Complete transaction-processing stack integration | 0.1.0 | Draft |
| [ISI-2](programs/ISI-2/0.1.0/README.md) | Overlay synchronization, submission, and lookup | 0.1.0 | Draft |
| [ISI-3](programs/ISI-3/0.1.0/README.md) | Remote wallet storage boundary and mediated synchronization | 0.1.0 | Draft |
| [ISI-4](programs/ISI-4/0.1.0/README.md) | BRC-100 wallet and application interoperability | 0.1.0 | Draft |

All four programs use [ITCVE-1](itcves/ITCVE-1/0.1.0/README.md). ISI-1 defines the integrated foundation; the other programs evaluate narrower profiles within it. Results are specific to the executed profile and artifact combination.

BSV Desktop is the initial reference wallet candidate. The initial application candidate is a compiled tarball from `p2ppsr/todo-ts`. Their [candidate manifests](suts/README.md) record provenance and outstanding admission requirements.

## Run the offline core

Use Node.js 22 or later. These commands require no package installation or external services:

```sh
npm test
npm run check
npm run demo
node bin/tpnil.mjs verify out/demo
node bin/tpnil.mjs replay out/demo
```

The demo performs a synthetic laboratory self-test, writes a content-addressed result and hash-linked journal to `out/demo`, and verifies repeatability. Results carry the `LAB_SELF_TEST_ONLY` designation. Each run requires a fresh output directory; for subsequent runs use `node bin/tpnil.mjs demo out/another-run`.

The [operator guide](docs/operator-quickstart.md) covers artifact hashing, compiled web-root packaging, evidence verification, and journal recovery.

## Documentation and repository map

- [Conformance model](docs/conformance-model.md), [determinism](docs/determinism.md), and [evidence policy](docs/evidence.md) define evaluation and reporting.
- [Architecture](docs/architecture.md), [adapter contract](adapters/README.md), and [schemas](schemas/README.md) define laboratory interfaces.
- [Source research](docs/research/landscape.md), [decision register](docs/decisions.md), and [roadmap](ROADMAP.md) connect the foundation to its next qualification stages.
- [Participation](CONTRIBUTING.md) explains submissions and technical contributions.

`programs/` holds versioned requirements and vector catalogs; `itcves/` defines environment profiles; `schemas/` holds machine-readable contracts; `src/` and `bin/` implement the offline core; `adapters/` specifies the control plane; `suts/` records artifact candidates; `fixtures/` contains laboratory self-tests; `journals/` retains accepted evidence; and `docs/` contains technical policies and research.
