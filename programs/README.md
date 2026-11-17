# Program register

TPNIL defines five independently selected programs. [index.json](index.json) selects their current versions; earlier definitions remain retained.

| Program | Scope | Initial profile |
| --- | --- | --- |
| [ISI-1](ISI-1/0.1.0/README.md) | Integrated transaction processing network | `full-stack` |
| [ISI-2](ISI-2/0.1.0/README.md) | Overlay synchronization, submission, and lookup | `overlay-http-sync` |
| [ISI-3](ISI-3/0.1.0/README.md) | Remote Wallet Storage synchronization and HTTP boundary | `storage-http-sync` |
| [ISI-4](ISI-4/1.0.0/README.md) | Production BRC-100 wallet/application interoperability | `production-wallet-todo` |
| [ISI-6](ISI-6/0.1.0/README.md) | Optional UMP and wallet profile continuity semantics | `ump-profiles` |

Program identifiers are permanent. ISI-1 defines full integration; the other programs select versioned profiles of ITCVE-1. ISI-4 1.0.0 supersedes mandatory wallet regtest admission with production-fidelity intake.

Each `catalog.json` is a machine-validated design catalog containing requirement IDs, origins, references, vector steps, expected observations, evidence, and unresolved dependencies. Design-only cases are marked `executable: false`. ISI-6 has an executable observation evaluator; its native adapter and SUT admission remain separate. Adoption requires clause-level references, exact fixtures, independent executable predicates, admitted component digests, and qualified adapters.

The `production-wallet-todo` profile covers the application's wallet interactions. A comprehensive BRC-100 profile additionally requires the [complete boundary inventory](../docs/boundary-inventories.md).

ISI-6 is explicitly opt-in and adds no ISI-4 acceptance requirement. Its digest-bound evaluator and synthetic regressions are described in [the profile](ISI-6/0.1.0/README.md).
