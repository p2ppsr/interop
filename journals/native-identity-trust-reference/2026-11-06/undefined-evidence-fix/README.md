# Direct native-format evidence serialization correction

Native attempt [42309035783](https://github.com/p2ppsr/interop/actions/runs/42309035783)
completed all 42 boundary predicates, including both positive trusted discovery
methods. Its observer then failed to serialize an explicit `undefined` optional
argument captured in the public settings trace. The original attempt remains in
the separate failed-attempt journal. It receives no completed qualification.

The correction encodes undefined values as null plus their exact JSON Pointer
paths in a detached evidence snapshot. It retains array arity, object property
presence and the distinction between explicit null and undefined. Native calls,
returned values, signed bytes and acceptance predicates remain unchanged.

Two fresh Go-backed reference executions each passed 42 boundary predicates and
eight trust predicates after real 121-second cache waits. One began without a
settings token; the other restored an existing token. Each sent the live helper
report directly to `EvidenceBundle.addJson` and `flush` before any intermediate
JSON serialization, then independently verified those exact canonical files.
The reference corpus and publication use their separately declared JSON wire
representation; native CWI already performs that transport serialization. The
first local preflight incorrectly sent the raw Toolbox corpus to the same writer
and failed on its optional JavaScript properties. Both such preflight failures
and their passing trust predicates are retained separately in this inventory.
These local executions are engineering observations, not native qualification.

`summary.json` binds the exact compressed inventory and source digests.
`evidence.json.gz` uses the same UTF-8 content, size and SHA-256 inventory format
as the parent reference journal. It retains both probe sources, live raw reports,
native-format evidence, independent verification receipts and validation logs.
The focused tests also cover null/undefined distinctions, escaped property names,
detached snapshots, semantic tampering and the historical native qualification.

After extracting the inventory, replay either canonical case with:

```sh
node scripts/verify-native-trust.mjs EXTRACTED/identity-trust-live-reference-4/native-format/evidence/integrated
node scripts/verify-wallet-boundary.mjs EXTRACTED/identity-trust-live-reference-4/native-format/evidence/integrated --integrated
```

The second case is `identity-trust-live-existing-4`. The retained probe scripts
expect to run from `out/` and use owned local fixture processes.
