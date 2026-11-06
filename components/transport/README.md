# Wallet Relay and paid HTTP

The pinned published Wallet Relay and 402-pay packages execute one causal path:
a wallet pairs over authenticated encrypted WebSocket, an HTTP payment client
asks that remote wallet to construct a BRC-29 payment, and a separate recipient
wallet internalizes its Atomic BEEF before delivering content. The same path
runs with TypeScript or Go Wallet Storage. Native admission substitutes the
unchanged Yours extension's public CWI interface for the in-process payer.

`profile.json` fixes the assertions before qualification. `package-lock.json`
fixes package bytes, including SDK4 independently of the historical synthesis
SDK2 closure. The transaction boundary uses serialized protocol objects.

Run from the repository root with Node24:

```sh
npm ci --ignore-scripts --prefix components/transport
npm test --prefix components/transport
node scripts/run-transport.mjs out/transport-typescript typescript
node scripts/run-transport.mjs out/transport-go go
node scripts/run-rust.mjs out/rust out/transport-typescript/paid-http.json out/transport-go/paid-http.json
```

The Rust participant checks raw transaction identity, input scripts and value
conservation independently and rejects altered outputs. Its fixed positive and
negative vectors also cover framing, Merkle roots, signatures and BRC-42 keys.

SQLite replay claims use atomic writes shared across worker processes, persist
after restart, and fail closed on malformed IDs, capacity or database failures.
This is a local-filesystem implementation; a multi-host production deployment
requires its own durable shared database adapter. The eight-process test proves
only one concurrent claim succeeds. No infrastructure is deployed by this lab.

Relay permission denial is an explicit pairing-client decision. It does not
replace the native wallet's independent V005 permission findings. The protocol
client represents a mobile role without asserting phone, camera or physical
device coverage. Native wallet API operations and ordinary application UI
operations are recorded separately.

Each run creates fresh wallet identities, storage and HTTP endpoints. Results,
raw relay/HTTP observations, full payment BEEF, dependency identities and cleanup
receipts are retained. Output directories refuse an existing result. Prior
findings are not overwritten by retries.

The additional SQLite replay store is retired when an upstream supported store
passes the same atomicity, persistence, failure and replay predicates. Rollback
selects the previous frozen profile; no production data migration is involved.
