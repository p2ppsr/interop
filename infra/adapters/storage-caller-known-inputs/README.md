# Caller-declared known input roots

This layer follows the immutable `storage-sqlite-retry` layer. It applies a separately identified patch to Go SDK 1.7.3 and retains Go Wallet Toolbox v0.191.4 with all nine predecessor layers. The generated module files select both exact patched modules; the module cache and preceding build identities remain unchanged.

BRC-100 commit `39a643ff148a8dcd23ec08986a8ddeb7d5713743`, lines 656–657, permits an input's supporting validity proof to be omitted when `trustSelf: 'known'` accompanies its exact TXID in `knownTxids`, including an input previously unknown to the wallet. The input's raw transaction remains available and hash-bound for its output amount, script and current spend validation.

The input processor passes caller-declared roots to an optional verifier capability for that request. It retains the original body, validates all undeclared branches and runs current-spend script validation. Ordinary strict verification remains the fallback for custom verifiers without this capability: complete proofs continue to work, while incomplete proofs receive no new trust. Request-local declarations do not create globally trusted transaction rows or modify caches.

The SDK patch checks every supplied Merkle path, including unmarked and unreferenced paths. All computed roots at one height must agree and pass the configured chain tracker. Exact transaction/BUMP associations, indices and body identities remain required even for a caller-declared valid root. The ordinary verification path receives the same supplied-proof correction. Nil receivers and malformed path metadata fail closed.

The host adds two authenticated, read-only control routes to its existing process:

- `GET /control/v1/native-certificate-inventory?identityKey=…` returns all owned certificates and fields, including deleted and malformed tuples. It checks relationships, bounds and provider identity, and represents key material only by a raw-byte hash. Its schema is `tpnil-native-certificate-inventory@1.0.0`.
- `GET /control/v1/transaction-knowledge-inventory` returns complete provider-global transaction knowledge, including raw-NULL rows, all users/statuses, deleted records and exact stored proof bytes. Its schema is `tpnil-native-transaction-knowledge-inventory@1.0.0`. This privileged fixture route uses the independent control token; it is not a wallet-facing API.

Each observation uses one database read transaction and rejects ambiguous identities, malformed ownership relationships, limits and incomplete data. These routes introduce no additional listener or service. Action query correlation requires its separate observer implementation and is not supplied by these inventory endpoints.

Prepare with `node scripts/prepare-storage-caller-known-inputs-go.mjs`. The resulting manifest schema is `tpnil-storage-caller-known-inputs-go-build@1.0.0`. A new explicit profile must bind the build, route schemas, observer ledgers and complete parent evidence before native admission. Existing selectors and executed profiles retain their prior identities.

The source correction and observer tests are laboratory self-tests. Local candidate-library captures establish the reported source behavior and preserve their earlier failures; they do not establish native browser cache absence or native conformance. The separately retained unmarked-proof counterexample prompted the supplied-proof correction.

The imported toolbox and SDK retain their Open BSV License Version 5 in `LICENSE-toolbox` and `LICENSE-sdk`. Original TPNIL host observers and build orchestration use the repository's Apache-2.0 license.
