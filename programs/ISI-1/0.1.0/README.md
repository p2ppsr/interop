# ISI-1: Integrated transaction processing network

Version **0.1.0**, status **DRAFT**, profile `full-stack`, environment **ITCVE-1@0.1.0**.

The [catalog](catalog.json) defines draft requirements, vector plans, references, observations, evidence, and outstanding prerequisites. `npm run check` validates its structure. Profile adoption requires exact fixtures and independent executable oracles for every mandatory requirement.

[Decision 0001](../decisions/0001-layered-synthesis.md) establishes the layered route from standards vectors through the TPNIL Synthesis Board and the complete transaction-processing run. The deterministic full-stack topology uses program-controlled wallets on regtest. Production wallet binaries remain in ISI-4's controlled mainnet-wallet profile until a bridge profile is separately qualified.

| Requirement / vector | Intended assertion family | Requirement origin | State |
| --- | --- | --- | --- |
| ISI-1-R001 / ISI-1-V001 | Offline topology and deterministic funding | laboratory-profile | Draft; not executable |
| ISI-1-R002 / ISI-1-V002 | Integrated ToDo lifecycle | laboratory-profile | Draft; not executable |
| ISI-1-R003 / ISI-1-V003 | GlobalKVStore message with licensed image | laboratory-profile | Draft; not executable |
| ISI-1-R004 / ISI-1-V004 | CHIRP content variant | standard | Draft; not executable |
| ISI-1-R005 / ISI-1-V005 | Processing states and bounded recovery | open-interpretation | Draft; not executable |
| ISI-1-R006 / ISI-1-V006 | Substitution and portability matrix | laboratory-profile | Draft; not executable |

## Acceptance

PASS requires every applicable mandatory vector to execute successfully in two clean repetitions with matching declared semantic projections. Reports include every matrix cell and attempted outcome. Prerequisites, applicability, and other outcomes follow the [common conformance model](../../../docs/conformance-model.md).

## Profile boundaries

The SUT can replace any declared role in the complete stack. All remaining roles are digest-pinned support components. The initial end-to-end scenarios are mock-coin onboarding and ToDo spending, followed by GlobalKVStore/LCH/UHRP image publication and consumption, with a CHIRP variant. Each component and device combination must be explicitly represented; success in a reduced topology is not a full-stack result.

## Changelog

0.1.0: initial foundation and draft vector plans; layered synthesis execution strategy adopted; no SUT execution.
