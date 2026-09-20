# Synthesis implementation baseline

Observed **2026-09-20**. These observations select implementation candidates and test inputs. They are not TPNIL conformance findings.

## Current standards and reference code

| Component | Pinned revision | Relevant material | Observation |
| --- | --- | --- | --- |
| `bsv-blockchain/BRCs` | `9c9b3ecfe1c0b765400812deff57d018a01cf0ec` | BRC-26, BRC-35, BRC-167, BRC-170 and `apps/media/0170-conformance-vectors.json` | Current documents define the required UHRP, Global KVStore, CHIRP, and LCH boundaries. |
| `bsv-blockchain/ts-stack` | `f999e0c1aad9a7afd0cbadaaf23841d049af9d5a` | `@bsv/chirp`, `@bsv/lch`, `GlobalKVStore`, and `apps/lch-reference` | Provides current reference implementations, golden vectors, negative cases, and a wallet boundary for LCH payment. |
| `bsv-blockchain/uhrp-services` | `7239c3fb051cf5bb33bea2de1e19302d022f129f` | `tm_uhrp`, `ls_uhrp` | Implements UHRP PushDrop advertisement admission and lookup. |
| `bsv-blockchain/kvstore-services` | `47a13d504a8e9f7b6cd61b858abdc241987b9fc6` | `tm_kvstore`, `ls_kvstore` | Implements current Global KVStore admission, history retention, and selector-based lookup. |
| `bsv-blockchain/teranode-quickstart` | `2ef9915ffeec252a34b45755f11453ecc1f265f0` | regtest Docker topology, Teranode 0.15.9 | Supplies the starting processor closure; Arcade and Merkle Service still require an ISI-owned compose extension and pins. |
| `bsv-blockchain/arcade` | `1c44e133c91cc337a98bfb17047d4f9de95df71d` | transaction submission and lifecycle API | Distinguishes receipt, network acceptance, network observation, mining, rejection, and proof-bearing terminal results. |
| `bsv-blockchain/merkle-service` | `5979b0d2f04638593e93fa390d052abb5c22a2d3` | watch, callback, STUMP, block-processed, and reprocess paths | Supplies proof-observation inputs; TPNIL still needs its own proof and header oracle. |
| `p2ppsr/uhrp-vault` | `c23fe99ddc522f8f8b016ab9a458f5bfb43e9032` | current UHRP upload, list, resolve, renew UI | Useful application and wallet-integration reference, but not the post-board oracle. |

The historical post-board candidates were also reviewed: `p2ppsr/postboard-ui@923d73959652b99ea81db1374a4f52d1e4ea2033` and `p2ppsr/postboard-london@b6523348d473d2c112cac17f1f35e9b0a08b9001`. Both predate the current BRC-35, BRC-167, and BRC-170 implementations and use older wallet or overlay APIs. Their interaction concepts remain useful; their protocol code is not the foundation for the canonical application.

## Exploratory execution

The following focused upstream suites ran from a clean dependency installation under Node.js 24.19.0 and pnpm 10.33.2 at the pinned `ts-stack` revision:

| Suite | Result |
| --- | --- |
| `@bsv/chirp` | 9 suites, 109 tests passed |
| `@bsv/lch` | 16 suites, 118 tests passed |
| `lch-reference-app` | 2 files, 15 tests passed |

These results show that the selected source revision has an executable content and licensing base. They do not establish independent correctness, service interoperability, transaction processing, reproducibility across laboratories, or SUT conformance. TPNIL will freeze the upstream inputs, execute them through a qualified plan, and add independent oracles and cross-implementation checks before crediting them to ISI-1.

## Immediate engineering target

The next runnable target is a repository-owned service profile containing:

- Teranode regtest with deterministic mining and reset;
- Arcade and Merkle Service with a complete lifecycle event collector;
- ChainTracks-compatible header observation and an independent proof verifier;
- two overlay nodes serving `tm_kvstore`/`ls_kvstore` and `tm_uhrp`/`ls_uhrp`;
- two complete CHIRP hosts and deterministic content fixtures;
- distinct LCH issuer, Payee, evidence-provider, and Delivery-provider endpoints;
- two program-controlled BRC-100 wallets; and
- the TPNIL Synthesis Board application and an independent protocol driver.

The first infrastructure run will qualify health, reset, causal barriers, and evidence collection. The first scored run begins only after the fixture manifest, board-record contract, imported standards corpus, independent transaction/content oracles, and complete image closure are frozen.
