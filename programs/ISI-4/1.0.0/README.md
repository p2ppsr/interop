# ISI-4: production wallet and application interoperability

Version 1.0.0 — draft technical vectors with executable wallet drivers. Profile: `production-wallet-todo`. Environment: ITCVE-1 1.0.0.

ISI-4 evaluates unchanged production wallet artifacts in their mainnet configuration, using ordinary supported integration paths. [Decision 0001](../decisions/0001-production-fidelity.md) replaces the earlier regtest prerequisite with qualitative intake and explicit evidence of integration fidelity.

The initial environment supplies controlled services and isolated fixtures. It distinguishes wallet behavior, fixture-service behavior, and public-mainnet observations. The initial demonstration uses no public-mainnet funds or broadcast. [Decision 0005](../decisions/0005-multi-wallet-execution.md) defines the common browser-extension and Android execution lanes. [Decision 0006](../decisions/0006-controlled-wab-discovery-and-funding.md) defines the controlled WAB identity, Teranode-mined funding, root SLAP/SHIP discovery, and UMP boundary used to activate production mobile wallets through their ordinary configuration.

## Initial demonstration scope

| Vector | Observation |
| --- | --- |
| ISI-4-V001 | Production-artifact intake, supported initialization, and fixture funding |
| ISI-4-V002 | Encrypted task creation and correct PushDrop output/basket association |
| ISI-4-V003 | Listing, decryption, and reconstruction after a cold application reload |
| ISI-4-V004 | Redemption, value conservation, and the declared spent/spendable state |

The [catalog](catalog.json) marks V001–V006 executable. V007 awaits the ISI-3 multi-remote replacement profile, and V008 awaits the remaining clause-level BRC-100 fixtures. Every run still reports all eight outcomes so incomplete coverage remains explicit.

## Acceptance and fidelity

Admission follows [production SUT intake](../../../docs/intake.md). Adapters implement the laboratory lifecycle and drive the SUT's ordinary interfaces. Supported endpoint choices are recorded as configuration, with their effect on behavior assessed. No special wallet API, build, or regtest mode is required.

A vector passes only after valid execution with complete independent evidence. Missing control or visibility of a required service results in BLOCKED or INCONCLUSIVE as appropriate. Two clean repetitions compare declared semantic outcomes, preserving raw randomized bytes. The [common conformance model](../../../docs/conformance-model.md) governs reporting.

## Changelog

1.0.0: replaces mandatory regtest with production-fidelity intake and a controlled-service mainnet-wallet profile. V001–V006 now have an executable driver for the Yours Wallet and ToDo deployment. Android admission records exact supported and blocked observations. Public-network acceptance remains a separate evidence property.
