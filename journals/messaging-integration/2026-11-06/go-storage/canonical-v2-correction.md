# Native evidence canonicalization correction

The unchanged native wallet run 42305419944 completed two clean repetitions and
recorded all six messaging predicates as PASS in each. Its offline observer then
rejected the helper's `exchanges.json` hash. The helper's historical encoding,
misnamed `canonical-json`, used insertion-order `JSON.stringify`; the enclosing
`EvidenceBundle.addJson` recursively sorts keys. The prior flattening regression
only changed JSON formatting and did not exercise the actual envelope writer.
This is an `OBSERVER_VERIFICATION_ERROR`; the original native artifact remains
unchanged and unqualified.

The helper now emits `canonical-json-v2`, using recursively sorted keys with
ordered arrays and safe integer numbers. The verifier selects the declared
encoding explicitly. Historical insertion-order results keep their original
strict verification rule, so the failed native artifact cannot be silently
upgraded. Request/replay exchanges retain their original body strings; comparison
with the envelope's parsed request uses canonical JSON semantics rather than
object insertion order.

`native-messaging-go-engineering-3` is a new reference-wallet run over the final
patched Go storage closure. All six assertions and independent transaction,
recipient, ciphertext, discovery and lifecycle checks pass. The regression now
invokes the actual `EvidenceBundle.addJson` and `flush` implementation, confirms
v2 survives that transformation, and confirms historical insertion-order hashes
are still rejected after transformation. Missing-recipient-receipt and invalid-
transaction-signature negative cases also pass. This remains reference-wallet
engineering evidence, not unchanged-native-wallet qualification. The new native
run must generate its own correctly bound evidence.
