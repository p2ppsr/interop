# Prospective native coverage accountability

This append-only accounting preserves the original306 planning variants. It describes implementation scope for the prospective426-observation profiles; it is not a native verdict, an exemption from missing requirements, or complete BRC100 conformance.

The JSON companion contains one ordered row for every original case/variant pair, exact predecessor and policy digests, method scope, predicate mappings, missing work and a null current native verdict.

| Current implementation status | Planning rows |
| --- | ---: |
| `BLOCKED_NATIVE_CAPABILITY` | 72 |
| `BLOCKED_PUBLIC_OBSERVABILITY` | 1 |
| `FEASIBLE_NOT_IMPLEMENTED` | 63 |
| `IMPLEMENTED_AWAITING_NATIVE` | 31 |
| `INTERPRETATION_REQUIRED` | 14 |
| `PARTIAL_IMPLEMENTATION_AWAITING_NATIVE` | 124 |
| `REQUIRES_REAL_TIME_WINDOW` | 1 |

The denominator remains306 variants across36 groups. The native observation denominator is392 retained predicates +19 transaction-state predicates +14 certificate-state predicates +1 exact-cap permission predicate =426 per repetition. The33 new state predicates are not33 completed planning rows: the transaction module maps18 original rows and the certificate module maps11 formerly unexecuted rows. All require fresh native evidence; transaction mappings retain their method and interpretation limits.

The original official5.1.1 attempt43143722884 remains a failed observer attempt with392 observations per repetition (338 PASS,45 FAIL,9 BLOCKED). Its raw bytes and diagnostic results are preserved; neither new plan inherits those outcomes. Official5.1.1 and the PR368 engineering candidate retain separate artifact identities and qualification claims.

## Bounded implementations awaiting native evidence

- Transaction states:18 planning variants plus a fanout predicate, at most55 public calls and8 expected signed actions, no extra funding. Numeric defaults mean legal omitted values plus explicit controls; randomization means output multiset preservation. Known-source recovery and simultaneous script/length can safely succeed or reject under the frozen interpretation. Proof checks currently cover createAction, not every internalizeAction path.
- Certificate states:14 predicates and26 calls map11 formerly unexecuted variants. Three fresh direct certificates with two issuers/two types are compared against the exact authenticated preexisting baseline. A correct selective proof controls four tuple mutations. Direct extra URL is a pinned compatibility observation; one issuance request contains all five forbidden direct fields and does not test each field independently.
- Permission policy3: fixed100-satoshi cap before payments;11,13 and7-satoshi outputs with actual signed fees must total exactly100 without new consent. Trusted visible UI must show100 spent and0 remaining. Historical permission policies1/2 remain byte-for-byte unchanged.
- Final no-spend protections use independently joined post-shutdown provider ledgers and unmined transaction ancestry; a successful early check cannot hide a later forbidden spend. Failed native predicates remain failed, never absence proofs.

## Per-group accounting

| Original case group | Variants | Current statuses |
| --- | ---: | --- |
| `privileged.distinct-keyring` | 6 | BLOCKED_NATIVE_CAPABILITY: 6 |
| `privileged.authorization` | 6 | BLOCKED_NATIVE_CAPABILITY: 6 |
| `privileged.cache-lifecycle` | 4 | BLOCKED_NATIVE_CAPABILITY: 4 |
| `permissions.restart-persistence` | 8 | FEASIBLE_NOT_IMPLEMENTED: 3; IMPLEMENTED_AWAITING_NATIVE: 3; PARTIAL_IMPLEMENTATION_AWAITING_NATIVE: 2 |
| `permissions.revoke-persistence` | 5 | FEASIBLE_NOT_IMPLEMENTED: 1; IMPLEMENTED_AWAITING_NATIVE: 2; PARTIAL_IMPLEMENTATION_AWAITING_NATIVE: 2 |
| `permissions.linkage-decisions` | 6 | IMPLEMENTED_AWAITING_NATIVE: 4; PARTIAL_IMPLEMENTATION_AWAITING_NATIVE: 2 |
| `permissions.linkage-isolation` | 8 | FEASIBLE_NOT_IMPLEMENTED: 4; IMPLEMENTED_AWAITING_NATIVE: 3; INTERPRETATION_REQUIRED: 1 |
| `permissions.manifest-selection` | 5 | FEASIBLE_NOT_IMPLEMENTED: 2; IMPLEMENTED_AWAITING_NATIVE: 1; PARTIAL_IMPLEMENTATION_AWAITING_NATIVE: 2 |
| `permissions.standing-allowance` | 8 | FEASIBLE_NOT_IMPLEMENTED: 1; IMPLEMENTED_AWAITING_NATIVE: 7 |
| `permissions.allowance-boundaries` | 5 | FEASIBLE_NOT_IMPLEMENTED: 4; REQUIRES_REAL_TIME_WINDOW: 1 |
| `permissions.finite-expiry` | 7 | BLOCKED_NATIVE_CAPABILITY: 6; BLOCKED_PUBLIC_OBSERVABILITY: 1 |
| `wire.call-parity` | 28 | BLOCKED_NATIVE_CAPABILITY: 28 |
| `wire.frame-rejection` | 12 | BLOCKED_NATIVE_CAPABILITY: 12 |
| `wire.encoding-boundaries` | 10 | BLOCKED_NATIVE_CAPABILITY: 10 |
| `basket.ascii-length` | 9 | FEASIBLE_NOT_IMPLEMENTED: 3; PARTIAL_IMPLEMENTATION_AWAITING_NATIVE: 6 |
| `basket.unicode-and-namespace` | 12 | FEASIBLE_NOT_IMPLEMENTED: 3; PARTIAL_IMPLEMENTATION_AWAITING_NATIVE: 9 |
| `transaction.defaults` | 9 | FEASIBLE_NOT_IMPLEMENTED: 1; PARTIAL_IMPLEMENTATION_AWAITING_NATIVE: 8 |
| `transaction.signing-branches` | 9 | FEASIBLE_NOT_IMPLEMENTED: 1; INTERPRETATION_REQUIRED: 1; PARTIAL_IMPLEMENTATION_AWAITING_NATIVE: 7 |
| `transaction.consuming-conflicts` | 8 | PARTIAL_IMPLEMENTATION_AWAITING_NATIVE: 8 |
| `transaction.proof-trust` | 8 | FEASIBLE_NOT_IMPLEMENTED: 3; PARTIAL_IMPLEMENTATION_AWAITING_NATIVE: 5 |
| `transaction.batch-send` | 10 | FEASIBLE_NOT_IMPLEMENTED: 3; INTERPRETATION_REQUIRED: 3; PARTIAL_IMPLEMENTATION_AWAITING_NATIVE: 4 |
| `transaction.nosend-change` | 8 | FEASIBLE_NOT_IMPLEMENTED: 5; PARTIAL_IMPLEMENTATION_AWAITING_NATIVE: 3 |
| `transaction.internalization` | 10 | FEASIBLE_NOT_IMPLEMENTED: 9; INTERPRETATION_REQUIRED: 1 |
| `query.action-filters` | 6 | PARTIAL_IMPLEMENTATION_AWAITING_NATIVE: 6 |
| `query.action-includes` | 9 | PARTIAL_IMPLEMENTATION_AWAITING_NATIVE: 9 |
| `query.output-filters` | 7 | FEASIBLE_NOT_IMPLEMENTED: 1; PARTIAL_IMPLEMENTATION_AWAITING_NATIVE: 6 |
| `query.output-includes` | 7 | PARTIAL_IMPLEMENTATION_AWAITING_NATIVE: 7 |
| `query.pagination` | 9 | PARTIAL_IMPLEMENTATION_AWAITING_NATIVE: 9 |
| `certificate.issuance` | 11 | FEASIBLE_NOT_IMPLEMENTED: 1; PARTIAL_IMPLEMENTATION_AWAITING_NATIVE: 10 |
| `certificate.conditional-parameters` | 8 | IMPLEMENTED_AWAITING_NATIVE: 2; PARTIAL_IMPLEMENTATION_AWAITING_NATIVE: 6 |
| `certificate.direct-keyrings` | 9 | IMPLEMENTED_AWAITING_NATIVE: 2; INTERPRETATION_REQUIRED: 1; PARTIAL_IMPLEMENTATION_AWAITING_NATIVE: 6 |
| `certificate.selective-proof` | 10 | IMPLEMENTED_AWAITING_NATIVE: 4; INTERPRETATION_REQUIRED: 2; PARTIAL_IMPLEMENTATION_AWAITING_NATIVE: 4 |
| `certificate.inventory` | 8 | FEASIBLE_NOT_IMPLEMENTED: 1; IMPLEMENTED_AWAITING_NATIVE: 3; INTERPRETATION_REQUIRED: 1; PARTIAL_IMPLEMENTATION_AWAITING_NATIVE: 3 |
| `certificate.revocation` | 4 | FEASIBLE_NOT_IMPLEMENTED: 1; INTERPRETATION_REQUIRED: 3 |
| `certificate.discovery` | 9 | FEASIBLE_NOT_IMPLEMENTED: 9 |
| `crypto.conditional-signatures` | 8 | FEASIBLE_NOT_IMPLEMENTED: 7; INTERPRETATION_REQUIRED: 1 |

## Remaining work is still accountable

The following lists are exact planning IDs, not blanket unsupported labels. Partial rows also retain their specific missing work in the JSON.

### FEASIBLE_NOT_IMPLEMENTED

- `permissions.restart-persistence`: `protocol-lock`, `basket-lock`, `certificate-lock`.
- `permissions.revoke-persistence`: `single-restart`.
- `permissions.linkage-isolation`: `verifier`, `counterparty`, `protocol`, `level2-key`.
- `permissions.manifest-selection`: `subset-selected`, `spending-unchecked`.
- `permissions.standing-allowance`: `single-over-cap-deny`.
- `permissions.allowance-boundaries`: `concurrent-cap`, `abort-accounting`, `rejection-accounting`, `nosend-accounting`.
- `basket.ascii-length`: `bytes-0`, `bytes-4`, `bytes-5`.
- `basket.unicode-and-namespace`: `uppercase`, `double-space`, `trailing-basket`.
- `transaction.defaults`: `acceptDelayedBroadcast-omitted-true`.
- `transaction.signing-branches`: `foreign-reference-reject`.
- `transaction.proof-trust`: `unknown-not-in-knownTxids`, `conflicting-proof`, `wrong-merkle-root`.
- `transaction.batch-send`: `two-dependent-held`, `sign-sendWith`, `unknown-batch-txid`.
- `transaction.nosend-change`: `valid-subset`, `foreign-output`, `already-spent`, `out-of-range`, `noSend-false`.
- `transaction.internalization`: `wallet-payment`, `basket-insertion`, `both-output-types`, `missing-paymentRemittance`, `missing-insertionRemittance`, `conflicting-remittance`, `wrong-derivation`, `output-index-out-of-range`, `relinquish-without-spend`.
- `query.output-filters`: `relinquished-excluded`.
- `certificate.issuance`: `wrong-auth-identity`.
- `certificate.inventory`: `restart`.
- `certificate.revocation`: `relinquish-revoked`.
- `certificate.discovery`: `identity-match`, `attribute-match`, `attribute-no-match`, `multiple-certifiers`, `untrusted-excluded`, `bad-signature`, `bad-keyring`, `default-seekPermission-false`, `explicit-seekPermission-true`.
- `crypto.conditional-signatures`: `data-only`, `hash-only`, `neither-data-nor-hash`, `forSelf-false-default`, `forSelf-true`, `anyone-counterparty`, `identityKey-override`.

### INTERPRETATION_REQUIRED

- `permissions.linkage-isolation`: `level1-key-policy`.
- `transaction.signing-branches`: `sign-twice-reject`.
- `transaction.batch-send`: `sync-reject`, `delayed-submit`, `duplicate-batch-entry`.
- `transaction.internalization`: `replay`.
- `certificate.direct-keyrings`: `extra-field-key-policy`.
- `certificate.selective-proof`: `empty-fields-policy`, `duplicate-fields-policy`.
- `certificate.inventory`: `relinquish-repeat-policy`.
- `certificate.revocation`: `unspent-revocation`, `spent-revocation`, `wrong-outpoint`.
- `crypto.conditional-signatures`: `both-data-and-hash-policy`.

### BLOCKED_NATIVE_CAPABILITY

- `privileged.distinct-keyring`: `identity`, `child-key`, `encrypt`, `hmac`, `signature`, `linkage`.
- `privileged.authorization`: `deny`, `approve`, `missing-reason`, `short-reason`, `overlong-reason`, `grouped-grant-not-authority`.
- `privileged.cache-lifecycle`: `cache-valid`, `cache-expired`, `manual-lock`, `restart`.
- `permissions.finite-expiry`: `before`, `at-boundary`, `after`, `renewal-deny`, `renewal-approve`, `restart`.
- `wire.call-parity`: `code-01-createAction`, `code-02-signAction`, `code-03-abortAction`, `code-04-listActions`, `code-05-internalizeAction`, `code-06-listOutputs`, `code-07-relinquishOutput`, `code-08-getPublicKey`, `code-09-revealCounterpartyKeyLinkage`, `code-10-revealSpecificKeyLinkage`, `code-11-encrypt`, `code-12-decrypt`, `code-13-createHmac`, `code-14-verifyHmac`, `code-15-createSignature`, `code-16-verifySignature`, `code-17-acquireCertificate`, `code-18-listCertificates`, `code-19-proveCertificate`, `code-20-relinquishCertificate`, `code-21-discoverByIdentityKey`, `code-22-discoverByAttributes`, `code-23-isAuthenticated`, `code-24-waitForAuthentication`, `code-25-getHeight`, `code-26-getHeaderForHeight`, `code-27-getNetwork`, `code-28-getVersion`.
- `wire.frame-rejection`: `unknown-code`, `empty`, `truncated-origin`, `truncated-varint`, `truncated-field`, `invalid-boolean`, `invalid-utf8`, `invalid-byte-range`, `oversized-length`, `trailing-data`, `origin-spoof`, `error-frame`.
- `wire.encoding-boundaries`: `zero`, `varint-boundary`, `optional-absent`, `optional-false`, `empty-array`, `empty-object`, `utf8-multibyte`, `hex-leading-zero`, `base64-leading-zero`, `signed-offset`.

### BLOCKED_PUBLIC_OBSERVABILITY

- `permissions.finite-expiry`: `expiry-zero`.

### REQUIRES_REAL_TIME_WINDOW

- `permissions.allowance-boundaries`: `calendar-rollover`.

The finite-expiry `expiry-zero` row is separated from unavailable finite-deadline controls: normal indefinite grants exist, but the literal expiry0 representation is not publicly established. Calendar rollover is a real-time observation requirement, not a claim that the wallet lacks monthly accounting.

Permission partial mappings preserve the remaining distinctions: process restart does not substitute for an isolated lock/unlock; initial deny-then-approve is not inferred from post-revocation denial; basket-only individual revocation does not establish every category; selected spending does not establish unchecked/subset manifest behavior. Existing identity/discovery and clause leaf observations do not silently complete the broader certificate, cryptographic or transaction planning variants.

No new paid capacity is reserved here and no public-mainnet broadcast is authorized. Actual monetary, owned-capacity, operator and development-agent costs remain unknown. Source/reference self-tests are engineering evidence only; fresh native executions and their failures require separate retained receipts and full-cost reconciliation.
