# Go Wallet Storage native contract compatibility

This separately selected build applies the immutable storage-list-actions patch
chain to released `go-wallet-toolbox v0.191.4`, then adds the contract corrections
below. Historical source locks, binaries, qualification criteria and failed
attempts retain their original content. The native attempt
[43143722884](https://github.com/p2ppsr/interop/actions/runs/43143722884) exposed
the RPC and pagination mismatches; it remains a failed workflow.

The TypeScript storage JSON-RPC surface returns the affected-row count `1` after
successful output or certificate relinquishment. The Go local provider and REST
interfaces keep their error-only contract. The wrapper delegates through the
existing authenticated-identity and user binding; mutation errors, absent rows,
repeated removals and another user's requests cannot become successful results.
The shipped Yours 5.1.1 client requires this exact numeric count before returning
public `{ relinquished: true }`.

`listOutputs` accepts signed offsets. Zero and positive offsets retain oldest
first ordering. Negative offsets return newest first: `-1` starts at the newest
matching output, `-2` skips it. Filtering, tenant ownership and total count apply
before direction and pagination; offsets beyond the matching set return an empty
page with the original total. The existing one-million skipped-row limit applies
to both directions. The pinned Go SDK's unsigned wallet-facing offset type still
limits its own request builder; the storage JSON-RPC surface and storage argument
type support signed offsets.

`listActions` leaves application consent to the authenticated wallet. Storage
accepts `seekPermission:false` without weakening identity checks. Script-detail
flags are inactive when the caller omits their parent input/output collection;
they do not cause storage to reject otherwise valid queries. Signed net amounts,
transaction state, all-user filtering and existing page sizes are preserved.

When `includeLabels:true`, action labels include the BRC-153 annotation generated
from the transaction's own stored reference. Existing labels beginning with the
reserved `reference ` prefix are replaced. Other labels and BRC-114 time labels
are preserved. The annotation is never persisted into ordinary label records.
Malformed stored references fail; absent legacy references cannot manufacture a
reference annotation. Callers relying on a current-action match must reject an
absent or ambiguous match. Labels remain omitted when they are not requested.

The controlled host exposes a separate bearer-authorized, read-only action
reference snapshot for independent verification. It joins transactions to the
requested wallet identity, includes signed transaction IDs and their stored
references, and rejects malformed, ambiguous or over-budget results. It does not
alter the existing transaction observer or any wallet-private state.

`listCertificates` preserves the full TypeScript signer's `partial` lookup tuple:
type, certifier, serial number, subject, revocation outpoint and signature.
Previously the Go argument type omitted type and certifier, allowing a proof
request with a different issuer to retrieve the original certificate's field
keys. All supplied tuple fields now use exact equality, including case-sensitive
Base64 serial matching in the lab's SQLite backend. Partial type and certifier
constraints intersect with public array filters; neither constraint overrides
the other. Validation and authenticated tenant scope remain required.

## Normative and implementation sources

- [BRC-100, pinned39a643f](https://github.com/bsv-blockchain/BRCs/blob/39a643ff148a8dcd23ec08986a8ddeb7d5713743/wallet/0100.md): `listOutputs` offset definition and the independent optional `listActions` fields. SHA256 `537ab393c655195e8cd61897b00d6b187a36f17d930493f8af48430752064082`.
- [BRC-153, same pinned revision](https://github.com/bsv-blockchain/BRCs/blob/39a643ff148a8dcd23ec08986a8ddeb7d5713743/wallet/0153.md): response-derived references, reserved-prefix replacement, stable reference recovery and optional label inclusion. SHA256 `c5e2fca1f281ef6833531781f6bc7a41242e19f81ccd94f398522e2d799d91d2`.
- The exact Yours 5.1.1 archive and its source map supply the storage mutation result requirement. The reference-label implementation matches the separately pinned candidate toolbox helper; this adapter does not change wallet consent policy or claim that an application build is qualified.

## Preparation and verification

Run `node scripts/prepare-storage-native-contracts-go.mjs`. The preparer checks
the released module checksum, host module lock and every ancestor lock, patch and
changed-file digest. It reconstructs `out/storage-native-contracts-go-source`,
runs the host Go suite and affected storage, mapping, action and validation
suites, including an authenticated TypeScript AuthFetch-to-Go RPC test, and emits
`out/itcve-go-storage-native-contracts` with its build manifest. That manifest
binds the host Go source inventory, module locks, preparer and TypeScript RPC
test. Runtime admission and independent evidence verification check that exact
inventory and its hashes for this prospective build.

Tests exercise actual SQLite mutations through authenticated HTTP, affirmative
mutation counts, absent/repeated removals, unauthorized and cross-tenant access,
newest-first and beyond-end pagination, inactive script flags, wallet-resolved
consent, synthetic reference integrity and reference recovery for aborting an
unsigned action. These are `LAB_SELF_TEST_ONLY` host tests. Native qualification
requires a new frozen profile and retained native execution.

Certificate regressions exercise all six mismatched tuple fields, case-sensitive
serials, conflicting array filters, malformed partial arguments and another
authenticated user. The real TypeScript-to-Go AuthFetch test independently
checks the complete tuple and filter intersection before removing the fixture.

Retire this layer after an upstream release supplies equivalent behavior and
passes the same contract tests and native qualification. Rollback selects the
previous storage-list-actions profile; it never rewrites historical evidence.
