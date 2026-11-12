# Program register

TPNIL defines five programs. [index.json](index.json) selects their current versions; earlier definitions remain retained.

| Program | Scope | Initial profile |
| --- | --- | --- |
| [ISI-1](ISI-1/0.1.0/README.md) | Integrated transaction processing network | `full-stack` |
| [ISI-2](ISI-2/0.1.0/README.md) | Overlay synchronization, submission, and lookup | `overlay-http-sync` |
| [ISI-3](ISI-3/0.1.0/README.md) | Remote Wallet Storage synchronization and HTTP boundary | `storage-http-sync` |
| [ISI-4](ISI-4/1.0.0/README.md) | Production BRC-100 wallet/application interoperability | `production-wallet-todo` |
| [ISI-5](ISI-5/0.1.0/README.md) | Multicast transaction and object delivery | `multicast-delivery` |

Program identifiers are permanent. ISI-1 defines full integration; ISI-2 through ISI-4 select versioned profiles of ITCVE-1, and ISI-5 selects ITCVE-2. ISI-4 1.0.0 supersedes mandatory wallet regtest admission with production-fidelity intake.

Each `catalog.json` is a machine-validated design catalog containing requirement IDs, origins, references, vector steps, expected observations, evidence, and unresolved dependencies. Initial cases are marked `executable: false`. Adoption requires clause-level references, exact fixtures, independent executable predicates, admitted component digests, and qualified adapters.

The `production-wallet-todo` profile covers the application's wallet interactions. A comprehensive BRC-100 profile additionally requires the [complete boundary inventory](../docs/boundary-inventories.md).
