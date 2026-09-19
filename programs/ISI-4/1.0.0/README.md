# ISI-4: production wallet and application interoperability

Version 1.0.0 — draft technical vectors; production-fidelity intake policy adopted. Profile: `production-wallet-todo`. Environment: ITCVE-1 1.0.0.

ISI-4 evaluates unchanged production wallet artifacts in their mainnet configuration, using ordinary supported integration paths. [Decision 0001](../decisions/0001-production-fidelity.md) replaces the earlier regtest prerequisite with qualitative intake and explicit evidence of integration fidelity.

The initial environment supplies controlled services and isolated fixtures. It distinguishes wallet behavior, fixture-service behavior, and public-mainnet observations. The initial demonstration uses no public-mainnet funds or broadcast.

## Initial demonstration scope

| Vector | Observation |
| --- | --- |
| ISI-4-V001 | Production-artifact intake, supported initialization, and fixture funding |
| ISI-4-V002 | Encrypted task creation and correct PushDrop output/basket association |
| ISI-4-V003 | Listing, decryption, and reconstruction after a cold application reload |
| ISI-4-V004 | Redemption, value conservation, and the declared spent/spendable state |

The [catalog](catalog.json) also retains permission/substrate, broadcast-lifecycle, portability, and comprehensive boundary plans. All remain non-executable until their required drivers, exact fixtures, and predicates are implemented and qualified. Reports distinguish a four-vector demonstration from broader profile coverage.

## Acceptance and fidelity

Admission follows [production SUT intake](../../../docs/intake.md). Adapters implement the laboratory lifecycle and drive the SUT's ordinary interfaces. Supported endpoint choices are recorded as configuration, with their effect on behavior assessed. No special wallet API, build, or regtest mode is required.

A vector passes only after valid execution with complete independent evidence. Missing control or visibility of a required service results in BLOCKED or INCONCLUSIVE as appropriate. Two clean repetitions compare declared semantic outcomes, preserving raw randomized bytes. The [common conformance model](../../../docs/conformance-model.md) governs reporting.

## Changelog

1.0.0: replaces mandatory regtest with production-fidelity intake and a controlled-service mainnet-wallet profile. Initial demonstration scope is V001–V004; public-network acceptance is a separate evidence property.
