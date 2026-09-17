# ISI-3: Remote wallet storage synchronization and HTTP interoperability

Version **0.1.0**, status **DRAFT**, profile `storage-http-sync`, environment **ITCVE-1@0.1.0**.

The [catalog](catalog.json) defines draft requirements, vector plans, references, observations, evidence, and outstanding prerequisites. `npm run check` validates its structure. Profile adoption requires exact fixtures and independent executable oracles for every mandatory requirement.

| Requirement / vector | Intended assertion family | Requirement origin | State |
| --- | --- | --- | --- |
| ISI-3-R001 / ISI-3-V001 | Mediated initial synchronization | laboratory-profile | Draft; not executable |
| ISI-3-R002 / ISI-3-V002 | Incremental updates and idempotence | laboratory-profile | Draft; not executable |
| ISI-3-R003 / ISI-3-V003 | Restart, resume and provider failover | laboratory-profile | Draft; not executable |
| ISI-3-R004 / ISI-3-V004 | Transaction and proof state fidelity | open-interpretation | Draft; not executable |
| ISI-3-R005 / ISI-3-V005 | Identity scoping and permitted record access | laboratory-profile | Draft; not executable |
| ISI-3-R006 / ISI-3-V006 | Full HTTP Remote Wallet Storage boundary | laboratory-profile | Draft; not executable |

## Acceptance

PASS requires every applicable mandatory vector to execute successfully in two clean repetitions with matching declared semantic projections. Reports include every matrix cell and attempted outcome. Prerequisites, applicability, and other outcomes follow the [common conformance model](../../../docs/conformance-model.md).

## Profile boundaries

The SUT is a digest-pinned Remote Wallet Storage server. Synchronization must pass from reference storage through the provided multi-remote wallet into the SUT. Direct database copying bypasses the boundary and does not count. Canonicalize logical entity identities and relationships, not implementation-specific row IDs. The storage contract must be published separately from BRC-100.

## Changelog

0.1.0: initial foundation and draft vector plans; no SUT execution.
