# Transaction-state engineering reference

This is an untouched local TypeScript Wallet-to-Go Storage report, not a native
Yours Wallet session or qualification. The source-bound run used the pinned
synthesis dependencies and the separately selected native-contracts Go build.
It completed29 public wallet calls,7 signed transactions and19 independent
predicates (19 PASS) in0.655 seconds including local service setup. Those timings
are local measurements; they do not estimate native UI or paid-run cost.

The full synthesis-source inventory was unchanged between the retained before
and after manifests. The binary build manifest binds host Go sources, module
locks and compatibility patch ancestry. `provenance.json` hashes the original
report, verification receipt, source manifests and original runner. The original
runner can be copied to `out/transaction-states-reference/run.ts` and invoked
from the repository root with `node --import
./synthesis/node_modules/tsx/dist/loader.mjs
out/transaction-states-reference/run.ts` after preparing the selected Go build.

The earlier local17 PASS/2 FAIL report is retained separately in [the initial interpretation archive](../initial-interpretation-20261111/interpretation-correction.json). Its two blanket-rejection interpretations were
withdrawn before native execution: the specification does not prohibit verified
recovery of an already known input, nor does it expressly make a complete
unlocking script and an optional length hint mutually exclusive. This fixture
checks independently proven safe spending or a structured rejection without a
spend. The prospective policy explicitly retains those normative limits; it does
not claim complete BRC-100 conformance.

`reviewed-source-execution.json` records a later full-source-stable run after
stronger staged-to-signed transaction linkage checks (19 PASS,29 calls,7 signed
actions,0.667 seconds). The original report and receipt remain unchanged.

The final review adds an empty submission-window requirement for every rejected
call. Two valid-stored-transaction counterexamples reproduced a false pass before
that correction. The retained final tests pass27 transaction-state mutations
and5 component-identity checks;8 explicit Go matrix cases remain intentionally
outside this offline test invocation. A fresh source-stable public reference
run again passes19 predicates in29 calls with7 signed transactions (0.661 seconds).
See `final-review.json`, its source manifests and execution receipt.
