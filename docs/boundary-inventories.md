# Boundary inventory and contract extraction

These planning inventories define the initial scope for contract extraction. Every adopted boundary requires pinned request/result/error schemas, HTTP methods and routes, content types, byte encodings, authentication/authorization, CORS and origin behavior, timeouts, ordering, limits, pagination, version negotiation, and state pre/postconditions. Profile adoption requires a complete clause-to-method-to-vector matrix.

## BRC-100

Inventory: `createAction`, `signAction`, `abortAction`, `listActions`, `internalizeAction`, `listOutputs`, `relinquishOutput`, `getPublicKey`, `revealCounterpartyKeyLinkage`, `revealSpecificKeyLinkage`, `encrypt`, `decrypt`, `createHmac`, `verifyHmac`, `createSignature`, `verifySignature`, `acquireCertificate`, `listCertificates`, `proveCertificate`, `relinquishCertificate`, `discoverByIdentityKey`, `discoverByAttributes`, `isAuthenticated`, `waitForAuthentication`, `getHeight`, `getHeaderForHeight`, `getNetwork`, `getVersion`.

Reconcile this baseline against the pinned BRC-100 and SDK interfaces before adoption. For each method cover applicable fields, defaults, constraints, result variants, errors, permissions, and substrate behavior. BRC-5 HTTP, BRC-6 XDM and BRC-7 window communications are separate transport profiles. Add normative references for BRC-42/43 derivation, baskets, PushDrop, BEEF, proofs, authentication, and certificate operations where applicable. ToDo covers only a subset.

## Overlay

The inspected TypeScript implementation supplies public submission and lookup plus synchronization routes. Freeze BRC-22 submission and BRC-24 lookup independently of implementation admin routes. BRC-87 naming, BRC-88 discovery, and optional BRC-136 anchors require explicit applicability. Extract the actual selected synchronization routes, envelopes, topic-manager decision contract and retention rules into a reviewed wire contract. Require independent canonical UTXO-set derivation; equal database row counts are insufficient.

## Remote Wallet Storage

The inspected TypeScript server uses JSON-RPC 2.0 over HTTP POST `/` and maintains an explicit allowed method set including lifecycle, action, output, certificate and sync operations. The Go documentation describes an authenticated `remote_storage` provider. These are observed implementation contracts, not automatically equivalent normative standards. Resolve method naming/dispatch, auth identity, field encodings, errors and capabilities through concrete cross-stack tests.

Initial families: availability/settings/capabilities; user identity/provider activation; action construction/processing/abort; transaction internalization and proof updates; output/basket reads and relinquishment; action/label/tag reads; certificate operations; synchronization chunk/checkpoint/transfer methods. New action-batch and transfer extensions must be versioned separately. Maintenance operations such as `destroy` and `migrate` require separate applicability and authorization rules.

## Transaction services and content

The transaction-service inventory pins Arcade's OpenAPI and event contract, including submission, transaction status, event stream, and selected header and proof routes. HTTP receipt, transaction acceptance, and mined status require distinct assertions. Merkle Service and ChainTracks retain separate versioned contracts, including in bundled distributions. BRC-26 UHRP, BRC-167 CHIRP, BRC-170 LCH and the chosen GlobalKVStore payload contract have separate oracles for location, content integrity, rights, payment and state.
