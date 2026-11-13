# Deterministic Go synchronization ancestry

Go11 is an additive compatibility artifact over the immutable Go10 caller-known-inputs build. It changes only deterministic BEEF transaction traversal order in Go SDK1.7.3. The toolbox, RPC APIs, generated single-process host, caller-known-root verification, fee/credit accounting and inventory/lifecycle controls remain the exact parent build. Parent lock and SDK pre/postimages are verified before compilation.

Native19 capture2 retained the same eight transaction bodies and Merkle proofs in two exported ancestry graphs, with different sibling ordering. Its complete-logical-dataset predicate correctly failed the byte-exact comparison. The failed archive remains immutable. Go11 sorts traversal roots by transaction identity, retains signed input order and the implicit newest target, and preserves every raw transaction/proof byte and proof index. It does not sort or rewrite retained observation data.

The exact captured graphs reproduce the Go10 failure. Go11 tests512 insertion-order permutations/round-trips, all transaction metadata and proof bytes, and the full SDK transaction suite. A new frozen native artifact is required; these controls are LAB_SELF_TEST_ONLY. Earlier Go10 manifests, patches and qualification records retain their original identities. Upstream SDK/toolbox licenses remain at the parent adapter.
