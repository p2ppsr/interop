# Native completion coverage accounting

The [completion inventory](native-coverage-accountability-20261112-completion-delta.json)
adds 163 scoped predicates to the 535 retained identities for ITCVE-1@4.5.0 /
ISI-4@5.5.0. Its planned denominator is 698 observations per repetition. This
inventory records implementation scope; it executes no native session and
qualifies no planning row. The original 306-row proposal and its classifications
remain unchanged.

| Completion module | Added predicates | Previously partial planning rows addressed |
| --- | ---: | ---: |
| Permission sequences | 8 | 8 |
| Basket boundaries | 39 | 15 |
| Query pagination | 25 | 7 |
| Certificate rejection branches | 20 | 20 |
| Transaction branches, including combined batch return | 8 | 8 |
| Existing trace and current parent joins | 63 | 61 |
| Total | 163 | 119 |

These counts use different units. A module can split a broad planning row into
several independently checked predicates. The trace module's two additional
predicates retain explicit blockers for a combined call absent from that trace
and whole-action membership. The transaction module executes the combined call
separately. No blocked trace is rewritten into a passing observation.

Five of the 124 previously partial planning rows retain separate requirements:
three unspecified numeric defaults, an unspecified universal script/length
mutual-exclusion rule, and complete empty-label action-query membership. The
new action observer retains authenticated RPC envelopes and complete SQL query
cuts through shutdown; it does not yet join every public CWI call to the exact
storage query and normative membership rule. The explicit-known-source
transaction fixture observes complete backend absence, but whole native
frontend cache non-exposure remains a separate requirement.

The broader inventory still contains 69 native-capability dependencies, 15
interpretation dependencies, one real calendar-boundary requirement and one
public-representation dependency. Previously implemented behavior and the
separately reused discovery predicate also require their current native proof. Adding predicates
does not eliminate these obligations or make `coverage.remaining-obligations`
pass. The [results report](../../../docs/native-conformance-results-2026-11-12.md)
records actual executions, failures and qualification boundaries separately.
