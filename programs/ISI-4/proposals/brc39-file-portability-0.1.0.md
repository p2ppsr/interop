# BRC-38/39 wallet file portability profile

Version 0.1.0, **PROPOSED**. This profile develops the file boundary of ISI-4 V007.
The adopted ISI-4 1.0.0 catalog and its existing results remain unchanged.

## Frozen references and scope

The reference set is BRCs commit
`2b959b13f1f73040d13cc4eb14edbfc376f8010b`, specifically
[BRC-38](https://github.com/bsv-blockchain/BRCs/blob/2b959b13f1f73040d13cc4eb14edbfc376f8010b/outpoints/0038.md)
and [BRC-39](https://github.com/bsv-blockchain/BRCs/blob/2b959b13f1f73040d13cc4eb14edbfc376f8010b/outpoints/0039.md).
The manifest in `fixtures/wallet-data/v1/manifest.json` pins the exact reference
and fixture bytes. Changes require a new profile revision before scored runs.

The laboratory uses isolated synthetic identities and data. Personal wallet
archives, signing snapshots, production credentials and public-network spending
are outside this profile. Publisher release qualification using an operator's
account remains separate operational evidence.

## Proposed requirements

| ID | Origin | Required observation |
| --- | --- | --- |
| FILE-01 | BRC-38 | Export contains one identity/network and every required category; all binary bytes, text, timestamps, flags and relationships survive. |
| FILE-02 | BRC-39 | Canonical WDAT header, NFC passphrase, Argon2id parameters and AES-GCM tag are independently verified. |
| FILE-03 | BRC-39 | Wrong passwords, altered tags/ciphertext, truncation, unsupported fields and excess KDF resources fail without activating data. |
| FILE-04 | laboratory-profile | Native file pick/save/share works across app restart and container relocation. |
| FILE-05 | laboratory-profile | Separate restore verifies read-back and preserves the current wallet and original artifact. |
| FILE-06 | laboratory-profile | Same-identity/network merge saves a before point; duplicate imports remain idempotent; failed destination pages stop progress. |
| FILE-07 | laboratory-profile | Cancellation, backgrounding, process exit and repeated resume retain recoverable data; altered stages and changed destinations are rejected. |
| FILE-08 | laboratory-profile | Explicit activation fences old sessions and monitors; signing authority requires independently recovered matching keys. |
| FILE-09 | laboratory-profile | Two admitted BRC-100 applications reconstruct their declared state on the destination without source application caches. |

Every ordered pair of admitted wallets is a separate matrix cell, with both
plaintext BRC-38 and encrypted BRC-39 artifacts and two clean repetitions.
Self-round trips supplement cross-wallet results. Initial proposed participants
are Metanet Desktop, Peacock, Metanet Explorer, BSV Desktop and BSV Browser;
reference implementations use identical admission criteria.

## Evidence and implementation status

The independent Node/OpenSSL envelope oracle is executable in
`src/portability/brc39.mjs`; it imports no wallet or Toolbox encryption code.
Its self-test covers the envelope and complete fixture projection, with a 64 MiB
laboratory file limit. It is not a general BRC-38 schema validator or a native
wallet driver. The retained all-category fixture is synthetic and carries
`LAB_SELF_TEST_ONLY` provenance.

The matrix is unexecuted until immutable publisher artifacts, platform adapters,
complete record-level semantic oracles, initial-state manifests, application
fixtures and reviewer acceptance are pinned. No SUT result or certification is
issued by this proposal. Independent schema/reference validation, adversarial
row/Unicode fixtures and native recovery fault injection are remaining work.
