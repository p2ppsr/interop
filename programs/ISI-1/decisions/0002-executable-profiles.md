# ISI-1 decision 0002: executable synthesis profiles

Status: **Adopted**
Date: **2026-09-20**

## Decision

ISI-1 adopts four composable executable profiles. Each profile states its own claim and retains independently verifiable evidence. Their combined success qualifies the current laboratory building blocks; it does not issue an ISI-1 SUT result.

1. The standards profile verifies the pinned BRC-167 and BRC-170 corpora and independent CHIRP and LCH invariants.
2. The reference protocol profile executes signed BRC-100-derived PushDrop board records, token revision spends, canonical UHRP advertisements and HTTP lookup, LCH acquisition, CHIRP availability, overlay synchronization, expiry, revocation, fault cases, and restart replay.
3. The Teranode runtime profile executes deterministic funding and mining, real board post and revision transactions, conflicting-spend rejection, transaction retrieval, and state recovery after a complete Compose restart.
4. The transaction-services profile executes Arcade intake and Merkle registration, submits signed transactions to the pinned Teranode runtime, mines them, provides Teranode's native block and subtree objects to Merkle Service, and verifies that Arcade's resulting proof reproduces the actual block-header root. One dependency-linked run passes for controlled funding, revision 3 of the mined Synthesis Board PushDrop token, its canonical UHRP advertisement, and the receipt-complete two-payee BRC-170 settlement. Companion profiles qualify embedded ChainTracks lifecycle and reorganization behavior and missed-callback recovery.

The reference protocol result is `LAB_REFERENCE_PROFILE_ONLY`. Teranode runtime evidence is `TERANODE_REGTEST_RUNTIME_QUALIFICATION`. External component results are `INFRASTRUCTURE_QUALIFICATION_ONLY`. No profile may be relabeled as SUT conformance.

## Reproducibility boundary

The Teranode profile pins the Quickstart source commit, every OCI index and platform digest, the generated environment, and the runner architecture. External component plans pin a clean source commit, input digests, command arguments, time limit, required semantic output, and every laboratory adapter by digest. The runner creates a disposable source archive, applies only the declared adapters, retains stdout and stderr, and records content-addressed inputs, observations, and results.

The macOS Docker Desktop adapter changes the address announced by the upstream end-to-end harness from a bridge gateway to `host.docker.internal`. This is an environment transport adaptation. It does not change transaction, block, proof, or acceptance semantics. The actual Teranode integration test is also a declared laboratory adapter because the upstream Arcade revision does not contain that TPNIL scenario.

## Proven transaction path

The retained joined board run establishes these causally linked observations for one transaction:

1. The fixture builder verifies the prior mined board token, creates a signed revision spend, combines it with a separately controlled fee input, verifies revision 3 and its predecessor reference, and emits the exact extended-format submission.
2. Arcade accepts that submission and registers the transaction with Merkle Service.
3. Arcade reports network acceptance after submission to the live pinned Teranode Asset boundary.
4. The transaction appears in the Teranode mempool and is mined by the controlled regtest miner.
5. The retrieved mined transaction bytes equal the submitted raw transaction bytes.
6. Merkle Service acquires the exact block and subtree objects served by that Teranode runtime.
7. Arcade receives a mined proof for the same transaction and block.
8. Independent proof computation reproduces the Merkle root in the actual Teranode block header.

The companion ChainTracks runs prove header tracking, proof lifecycle, competing-branch handling, orphan preservation, re-anchoring, and canonical reversion with deterministic block data. The missed-callback profile proves Merkle Service v0.6.0 `/reprocess` recovery for ten watched transactions. These runs do not claim that the retained joined run used Teranode's native peer-to-peer announcement service.

## Known boundary

Teranode v0.15.9 declares `gettxoutproof` but returns an unimplemented error in this profile. The laboratory therefore obtains proof evidence through the pinned Merkle Service boundary and validates it independently. This limitation is recorded in the runtime result.

The infrastructure reference path now includes the on-chain UHRP advertisement, on-chain LCH settlement, a clean dependency-linked run, restart recovery, reorganization behavior, and lost-callback recovery. The complete ISI-1 SUT path still requires a packaged browser application and an admitted external program-controlled BRC-100 wallet to create the same board, UHRP, and LCH transaction graph through their public interfaces. Component substitution, the program's required clean repetitions, and a scored run manifest remain part of that SUT evaluation.
