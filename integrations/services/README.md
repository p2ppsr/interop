# Real overlay and identity integration

This prospective package runs actual OverlayExpress, TypeScript Overlay Engine,
SQLite storage, Mongo lookup providers, TypeScript ChainTracks and the existing
pinned Go service host. The qualification uses controlled application policies
and synthetic transactions under locally mined regtest headers. Its claim is
`LAB_SELF_TEST_ONLY`; it does not establish native-wallet conformance.

The npm artifacts are pinned by exact versions and lockfile integrity. Selected
ChainTracks HTTP routes and Identity Services are copied without modification
from the exact repositories, commits and per-file hashes in `sources.json`.
The reviewed ts-stack commit is not presented as the build identity of an npm
artifact. `vendor/*/LICENSE.txt` preserves the upstream licenses.

From the repository root with the admitted Node and Go versions:

```sh
npm ci --prefix integrations/services
npm rebuild --prefix integrations/services better-sqlite3
npm run prepare:go
TPNIL_MONGOD=/usr/bin/mongod TPNIL_MONGO_VERSION=8.0.16 node scripts/run-overlay-identity.mjs out/services-attempt-1
node scripts/verify-overlay-identity.mjs out/services-attempt-1
npm test --prefix integrations/services
```

The output directory must be empty. Mongo's isolated replica set, both overlay
nodes, Go service host, SQLite handles and HTTP listeners are closed at the end.
Mongo binary path, SHA-256, version and process-exit evidence are retained. The
local macOS development run used Mongo 8.2.6; the joined Linux native profile uses
the existing 8.0.16 image. Neither is described as a production Mongo deployment.

The fourteen criteria cover HTTP admission/lookup, duplicate submission, real
SHIP and SLAP, two TypeScript peers, both Go/TypeScript GASP directions, persistence
after server replacement, competing higher-work headers and SQLite restart,
certificate issuer signatures, selective disclosure, issuer filtering and signed
relinquishment. Reverse Go GASP must transfer a new Go-only outpoint; transferring
an already known outpoint cannot pass. The offline verifier recomputes transaction
identities, proof/header relationships, certificate signatures and exact returned
outpoint sets, and rejects tampering even after an evidence digest is rebound.

The local retained result is under
`journals/services-integration/2026-11-06/local-01`. It passed all fourteen checks.
Earlier engineering failures remain under `journals/services-integration/2026-11-06/engineering-attempts`;
these are diagnostic observations, not revised passing results.

## Explicit interoperability adapters

* Go Overlay 1.3.8 emits absent GASP inputs as `null` and absent proof/metadata as
  empty strings. The Go HTTP host omits those absent optional fields only. Graph,
  transaction and nonempty proof/metadata remain unchanged.
* Overlay 2.7.0 emits a historical transaction once per traversed outpoint node.
  A graph referencing two outputs of one transaction therefore falsely fails its
  conflicting-spend check. `LabOverlayGASPStorage` deduplicates those identical
  transaction IDs after upstream traversal. Every distinct transaction remains
  subject to the upstream conflict and SPV checks. A regression test proves a
  genuine pair of conflicting transactions is still rejected.
* GASP's injected transport maps exactly one logical HTTPS peer to a loopback HTTP
  service, admitting only its two GASP paths. This is an isolated transport mapping,
  not evidence of TLS or public-network interoperability. Automatic public
  advertisement and peer discovery are disabled; signed SHIP/SLAP advertisements
  are explicitly submitted and resolved in the qualification.

## Reusable joined services

`src/overlay.ts` exports `startOverlayNode`, `submit`, `lookup` and `syncPeer`.
The factory accepts a `configure(node)` callback for additional real topic and
lookup providers; list their names in `controlledTopics` to disable automatic
peer discovery. It exposes the actual engine and loopback origin plus `close()`.

`src/identity.ts` exports `publishIdentityCertificate({wallet, origin, certificate})`.
It uses the supplied public wallet API to create a signed, spendable identity
token and a signed SLAP record, submits both to actual providers and checks the
lookup. Native profiles register the loopback provider with
`services.registerOverlayLookup(origin, ['ls_identity'])`. Wallet discovery also
requires the controlled issuer to be trusted through the wallet's public settings
path; an empty result is not a successful discovery assertion.

`synthesis/src/wallet-lab/native/synthesis.ts` exports
`runNativeSynthesis(wallet, services, output)`. It joins real wallet-created Board
and UHRP outputs, actual overlay admission/lookup and cold replica synchronization,
the pinned CHIRP library with two controlled content hosts, and the pinned LCH
library with two real storage-backed payment recipients. One content host is
offline during retrieval. It checks both recipient balances, receipts, license
recovery and the decrypted plaintext digest. This is an API-driven customer graph;
the native wrapper must separately establish which native wallet crossed the API.

LCH 0.1.0 emits base64url derivation strings while BRC-100 internalization requires
standard base64. The explicit `lchWalletBoundary` translates the same random bytes
for both payer/recipient key derivation and recipient remittance. Its result records
that adapter. The existing historical fixture flow is unchanged.

For an actual Toolbox API engineering check of that graph (not a native result):

```sh
TPNIL_MONGOD=/usr/bin/mongod TPNIL_MONGO_VERSION=8.0.16 node --import ./integrations/services/node_modules/tsx/dist/loader.mjs integrations/services/src/native-synthesis-probe.ts out/synthesis-attempt-1 typescript
```

Use `go` for the Go-backed variant. If the source-owned storage patch is selected,
set `TPNIL_STORAGE_SYNC_PATCH=1`; its exact patched build manifest is required.
Original upstream failures and patched results remain distinct observations.

`node scripts/verify-native-synthesis.mjs DIR` independently verifies the four
transactions against the retained Teranode mining root, LCH header/license/receipt
signatures, exact recipient outputs, plaintext bytes, signed Board ancestry and
the actual replica/UHRP answers. For the native evidence naming layout use
`DIR --integrated WALLET_IDENTITY`; this also requires the Board author and license
subject to equal that native identity. The latest retained Go engineering oracle
is `journals/services-integration/2026-11-06/go-joined-02/synthesis`.

New service runs emit version 2 of `rust-certificate-vectors.json`: the exact
certificate signature preimage (`Certificate.toBinary(false)`), the BRC-52 public
signing-key derivation, DER signature and an altered-preimage negative. The issuer
identity is the derivation parent; the signature uses its derived certificate key.
The retained local-02 version 1 vector incorrectly used the issuer identity for
signature verification and produced a Rust FAIL. That vector defect is preserved;
local-03 supplies the corrected vector and separate results. Rust independently
checks the public key derivation and SHA-256/ECDSA over the actual certificate.
