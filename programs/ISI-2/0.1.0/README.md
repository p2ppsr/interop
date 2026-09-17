# ISI-2: Overlay synchronization and HTTP interoperability

Version **0.1.0**, status **DRAFT**, profile `overlay-http-sync`, environment **ITCVE-1@0.1.0**.

The [catalog](catalog.json) defines draft requirements, vector plans, references, observations, evidence, and outstanding prerequisites. `npm run check` validates its structure. Profile adoption requires exact fixtures and independent executable oracles for every mandatory requirement.

| Requirement / vector | Intended assertion family | Requirement origin | State |
| --- | --- | --- | --- |
| ISI-2-R001 / ISI-2-V001 | Canonical topical state synchronization | standard | Draft; not executable |
| ISI-2-R002 / ISI-2-V002 | Submission and duplicate semantics | standard | Draft; not executable |
| ISI-2-R003 / ISI-2-V003 | Lookup service interoperability | standard | Draft; not executable |
| ISI-2-R004 / ISI-2-V004 | Incremental, resumed and bidirectional synchronization | laboratory-profile | Draft; not executable |
| ISI-2-R005 / ISI-2-V005 | Specified rejection and chain changes | open-interpretation | Draft; not executable |
| ISI-2-R006 / ISI-2-V006 | Complete public boundary inventory | laboratory-profile | Draft; not executable |

## Acceptance

PASS requires every applicable mandatory vector to execute successfully in two clean repetitions with matching declared semantic projections. Reports include every matrix cell and attempted outcome. Prerequisites, applicability, and other outcomes follow the [common conformance model](../../../docs/conformance-model.md).

## Profile boundaries

The SUT is a digest-pinned Docker/OCI image serving the public overlay HTTP boundary. Independent fixture semantics determine the reference topical state. The profile pins topic-manager and lookup-service behavior and evaluates the public submission and lookup interfaces.

## Changelog

0.1.0: initial foundation and draft vector plans; no SUT execution.
