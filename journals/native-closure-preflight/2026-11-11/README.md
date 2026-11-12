# Native closure engineering preflight

This archive preserves implementation checks, public TypeScript-wallet reference
runs, and independent adversarial reviews. It records **zero new native-wallet
sessions** and makes no native qualification or complete BRC-100 conformance
claim. The separate final source freeze and full repository validation belong in
`journals/native-closure-validation/2026-11-11`.

| Evidence | Retained outcome |
| --- | --- |
| Boundary script experiments | Initial clean-stack failure and NOP push-only failure; corrected DROP and final identity-reference runs each 42 PASS |
| Transaction states | Original 17 PASS/2 FAIL interpretation attempt retained; prospective safety checks 19 PASS in 29 public calls, 7 signed transactions |
| Certificate states | TypeScript storage 14 PASS; original Go 13 PASS/1 FAIL; corrected Go 14 PASS in 26 calls, with the same oracle |
| Go contract layer | Original build/test failures retained; final full storage, actions, validation, mapping and authenticated TypeScript RPC checks pass |
| Yours dependency candidate | Local 147 tests/867 expectations pass; published CI 43152452118 binds source 7e39006 |
| Independent observers | Exact-call, malformed-return, submission-window, delayed-target, denied-ancestor and fake-BUMP counterexamples and corrections retained; final ancestry review 58 tests and permission review 69 tests pass |

The two early transaction rejection assumptions were withdrawn before native
execution. Recovery of an already known input and simultaneous script/length
fields are now checked for independently proven safe processing or a structured
rejection without spending. Unspecified normative exclusivity remains explicit;
the old report has not been converted into a pass. The certificate failure was
fixed in Go's exact six-field certificate tuple filter; its policy stayed
unchanged. The final transaction/permission guards inspect verified shutdown
provider suffixes and independently resolved ancestry, stopping only at the
admitted mined root.

The final transaction reference also passed all 19 predicates against the final
Go build in 29 calls (0.604 seconds for the module). Its source inventories before
and after execution are identical. This local runtime excludes service startup,
builds, review and any native device execution.

[The manifest](manifest.json) records each original path, raw byte count/SHA256,
and deterministic gzip byte count/SHA256. All gzip headers have timestamp zero.
Its repository references point to already retained transaction fixtures and the
[Yours source/CI artifact](../../../fixtures/artifacts/yours-wallet-pr368-7e39006/provenance.json),
which are not duplicated. Earlier published failed native/CI archives and entire
dependency trees/source maps are also not duplicated. The largest compressed
record is the original failed full Go test log; it is intentionally unabridged.

From the repository root, run
`python3 journals/native-closure-preflight/2026-11-11/verify.py` to check every
stored/raw digest and repository reference. The retained
[integrity receipt](integrity-verification.json) also binds the manifest and
checker bytes.
Unknown monetary, owned-capacity, operator and development-agent costs remain
`null`. Local fixture satoshis, predicate counts and short reference runtimes
are not paid infrastructure charges or evidence of a cost improvement.
