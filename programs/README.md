# Program register

TPNIL defines four programs, each initially at version 0.1.0 with draft technical requirements:

| Program | Scope | Initial profile |
| --- | --- | --- |
| [ISI-1](ISI-1/0.1.0/README.md) | Integrated transaction processing network | `full-stack` |
| [ISI-2](ISI-2/0.1.0/README.md) | Overlay synchronization, submission, and lookup | `overlay-http-sync` |
| [ISI-3](ISI-3/0.1.0/README.md) | Remote Wallet Storage synchronization and HTTP boundary | `storage-http-sync` |
| [ISI-4](ISI-4/0.1.0/README.md) | BRC-100 wallet/application interoperability | `wallet-todo` |

Program identifiers are permanent. ISI-1 defines full integration; the other programs use constrained profiles of the same ITCVE-1 foundation.

Each `catalog.json` is a machine-validated design catalog containing requirement IDs, origins, references, vector steps, expected observations, evidence, and unresolved dependencies. Initial cases are marked `executable: false`. Adoption requires clause-level references, exact fixtures, independent executable predicates, admitted component digests, and qualified adapters.

The `wallet-todo` profile covers the application's wallet interactions. A comprehensive BRC-100 profile additionally requires the [complete boundary inventory](../docs/boundary-inventories.md).
