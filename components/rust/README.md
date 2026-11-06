# Rust protocol participant

This executable uses `bsv-blockchain/rs-sdk` at
`99d2313f2ede48a465aa8be1907d26d098aac8fd`; Cargo.lock freezes the complete Rust
dependency closure. `cargo build --locked` is mandatory. The runtime records the
participant binary digest separately from its source identity.

The stdin protocol is a bounded JSON array of `hash`, `key`, `signature`,
`derive`, `transaction`, `beef`, `script` or `spends` requests. Every response
contains an explicit `ok` field and either its result or parsing failure.
The participant makes no network requests and handles only isolated lab keys.

`vectors.json` supplies independently specified positive and negative
expectations. The Node runner verifies Rust signatures in TypeScript and
TypeScript signatures in Rust, the pinned real mined funding transaction and
Merkle root, and each serialized payment produced by the joined relay/402 lane.
Mutating a payment output must fail Rust script verification. Cross-language
agreement alone is not the oracle.

This integration establishes the evaluated protocol subset. Rust wallet GUI,
network transport and the entire SDK API are outside this participant's scope.
Original SDK licenses remain with their authors; the lab wrapper is Apache-2.0.
