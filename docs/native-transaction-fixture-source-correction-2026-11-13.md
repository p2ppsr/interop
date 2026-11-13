# Transaction branch fixture source correction

The source3 successor of the ITCVE-1 4.8 / ISI-4 5.8 execution plan retains the
original criteria, 698 observation identifiers, e360e67 wallet artifact, Go10
adapter and Rust3 graph oracle. It references the unchanged source2 plan and
Rust compatibility manifest. All earlier attempts remain immutable.

Native attempt15 (run43358474345) retained two matching678PASS / oneFAIL /
19BLOCKED captures. Its full-set transactions legitimately spent the remainder
as a bounded fee and produced no managed change. The stale unsigned-TXID fixture
incorrectly depended on that change. Its missing calls then triggered a global
evaluator exception before the final branch report was persisted. Original
qualification and both Rust repetitions are absent from that failed attempt.

The corrected program reuses the independently staged batch-sign fixture for
the stale unsigned-TXID check. A complete owned-provider cut identifies its
spendable default change before either request. The unsigned and signed graphs,
output index, exact request windows, rejected unsigned outpoint, accepted signed
outpoint, absence of early submissions and batch submission order remain checked.
The full-set check still proves independent necessity of every supplied source,
complete eligible inventory, signed intent, ancestry, scripts, fee bounds and
exact returned managed change. Zero managed change permits an omitted or empty
optional result field; a spurious or malformed nonempty return is rejected.
SignAction has no noSendChange result contract.

Row-specific observation windows are evaluated with their row. A missing stale
fixture yields an explicit blocked row instead of losing every branch result.
Global source, program, ownership, graph, provider, funding and context checks
remain fatal. The producer persists an invalid-evidence diagnostic before
propagating an evaluator failure and preserves available progress on execution
failure. Neither envelope can qualify a native session.

Preflight includes the exact current candidate client against the Go10 adapter,
full canonical program replay, both real native15 no-change counterexamples,
negative source/proof/provider/window/outpoint/batch controls, and an injected
fixture-staging failure. The injected sample is LAB_SELF_TEST_ONLY and retains
its failed and blocked rows. These local controls establish no native
qualification. Fresh original native qualification, both Rust results and
independent frozen replay remain required for the new source.

Wallet and standards findings remain data. In particular, signed net satoshis
are never absolutized or clamped to satisfy a positive-only schema. Full BRC100
conformance remains unproven while its declared coverage gates are blocked.
