# Implementation and standards landscape

Research baseline: 2026-09-17 UTC. The [2026-09-18 BSV Desktop intake](../intake.md) supersedes the wallet admission prerequisite and records v2.8.5 findings; observations below remain scoped to their original revisions. Repository heads and source-file SHA-256 digests are recorded in [sources.lock.json](sources.lock.json) and [source-files.lock.json](source-files.lock.json). These are discovery/provenance locks, not a runnable dependency closure. Licensing labels are observed repository metadata, not legal clearance.

## Specifications before implementation behavior

The [BRC repository](https://github.com/bsv-blockchain/BRCs/blob/39a643ff148a8dcd23ec08986a8ddeb7d5713743/README.md) is the primary standards source. Normative references identify individual clauses in commit-pinned BRC text. The source register covers wallet interfaces, overlay submission and lookup, CHIRP, and LCH.

[BRC-100](https://github.com/bsv-blockchain/BRCs/blob/39a643ff148a8dcd23ec08986a8ddeb7d5713743/wallet/0100.md) specifies the wallet/application interface and references additional standards for derivation, baskets, transactions, proofs and cryptography. A ToDo success sequence exercises only a subset of that interface. ISI-4 1.0.0 evaluates unchanged production wallets in mainnet mode against controlled services; older program versions retain their original regtest requirements.

## Initial wallet and application

[BSV Desktop v2.8.3](https://github.com/bsv-blockchain/bsv-desktop/releases/tag/v2.8.3) was the release observed at the 2026-09-17 research baseline. The current intake and native qualification use v2.8.5. Its macOS arm64 DMG was verified, installed twice on clean macOS VMs, and observed through the local BRC-100 bridge. Those infrastructure findings do not establish transaction-processing or application conformance.

The inspected [wallet service](https://github.com/bsv-blockchain/bsv-desktop/blob/cb0350d5472bf33bb8e599e6599f922324306e5e/src/lib/services/WalletService.ts) and [storage configuration](https://github.com/bsv-blockchain/bsv-desktop/blob/cb0350d5472bf33bb8e599e6599f922324306e5e/electron/storage.ts) use the main/test/ttn chain configuration. Native qualification confirms the admitted binary reports `mainnet`; controlled transaction, proof, header, and storage routes remain to be established. Source observations remain scoped to the pinned files.

[`p2ppsr/todo-ts`](https://github.com/p2ppsr/todo-ts/blob/236733c586c4d2cc3ab7f957afa382005509acd4/frontend/src/App.tsx) supplies the initial application candidate. The reviewed application encrypts task text with the `todo list` protocol and key ID `1`, creates PushDrop outputs in `todo tokens`, reads transaction-backed output lists, and redeems tasks via action construction and signing. Its QA/cache path motivates a fresh-browser reconstruction assertion. UI success messages alone cannot establish accepted chain state. The compiled web-root artifact must be separately hashed and admitted.

## TypeScript, Go, and Rust

The [TypeScript corpus format](https://github.com/bsv-blockchain/ts-stack/blob/82ab4d3c45cf031d536c54be0580a284c7b2db87/conformance/VECTOR-FORMAT.md) is a useful language-neutral precedent. Some expected values originate in its reference implementation. Corpus adoption requires compatible rights, pinned versions, independent oracle review, and scope mapping. HTTP and installed-binary interoperability require additional boundary tests.

The [Go conformance overview](https://github.com/bsv-blockchain/go-stack/blob/e36d173f997ba6dd5e39fe9da2db7bd0f83811db/conformance/README.md) records a staged migration and planned coverage. That document is a roadmap, not evidence that every listed wallet or HTTP boundary is implemented. The [Go storage server guide](https://github.com/bsv-blockchain/go-stack/blob/e36d173f997ba6dd5e39fe9da2db7bd0f83811db/packages/wallet/go-wallet-toolbox/docs/storage_server.md) and [TypeScript StorageServer](https://github.com/bsv-blockchain/ts-stack/blob/82ab4d3c45cf031d536c54be0580a284c7b2db87/packages/wallet/wallet-toolbox/src/storage/remoting/StorageServer.ts) need a reconciled public contract for dispatch, authentication, schemas and synchronization before ISI-3 can score cross-stack behavior.

The [Rust SDK](https://github.com/bsv-blockchain/rs-sdk/blob/aaec7f994f37c34d733c64336a64bbdae3ed0d14/README.md) describes wallet and HTTP-client primitives and a GlobalKVStore-capable service layer. It is a candidate source for additional implementations and independent validators, not a tested participant here. The adapter contract also accommodates Python, C++, Swift, Kotlin, and other languages.

## Mobile and browsers

The public [BSV Wallet](https://github.com/bsv-blockchain/bsv-wallet/blob/b2154b8cae0ac8f814d7d3130baf6cbcf9550302/README.md) documents a React Native/Expo iOS/Android wallet and external pairing. Its described native and pairing paths illustrate why an installed app, browser wallet and SDK client must have distinct profiles. Mobile binary admission and runner qualification remain outstanding. Participation is available under the same terms regardless of source availability.

## Full stack and content

[Teranode quickstart](https://github.com/bsv-blockchain/teranode-quickstart/blob/8ba35c743b5b367e670403f3762a9bf99e9195d0/README.md) documents regtest and a multi-service environment, providing a starting point for closure assembly; its defaults are not automatically a deterministic laboratory profile. The [Arcade HTTP contract](https://github.com/bsv-blockchain/arcade/blob/1c44e133c91cc337a98bfb17047d4f9de95df71d/openapi/arcade.openapi.yaml) separates submission, events and transaction/header observations. The profile distinguishes receipt, acceptance, and subsequent state transitions. [Merkle Service](https://github.com/bsv-blockchain/merkle-service/blob/5979b0d2f04638593e93fa390d052abb5c22a2d3/README.md) is separately versioned and must be included in provenance even when co-deployed.

[BRC-167 CHIRP](https://github.com/bsv-blockchain/BRCs/blob/39a643ff148a8dcd23ec08986a8ddeb7d5713743/overlays/0167.md) and [BRC-170 LCH](https://github.com/bsv-blockchain/BRCs/blob/39a643ff148a8dcd23ec08986a8ddeb7d5713743/apps/0170.md) are distinct content and rights layers. The [implementation guide](https://github.com/bsv-blockchain/ts-stack/blob/82ab4d3c45cf031d536c54be0580a284c7b2db87/docs/guides/chirp-lch-production.md) and [GlobalKVStore implementation](https://github.com/bsv-blockchain/ts-stack/blob/82ab4d3c45cf031d536c54be0580a284c7b2db87/packages/sdk/src/kvstore/GlobalKVStore.ts) help identify integration boundaries. ISI-1 still requires a nominated message-board artifact, exact payload schema, content fixture, rights policy, and independent payment/content assertions.

## Qualification priorities

The next stages complete the controlled-service closure for the production wallet, implement independent ToDo transaction and state predicates, and reconcile TypeScript/Go storage semantics. The [roadmap](../../ROADMAP.md) defines the qualification gates for each program.
