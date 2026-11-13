# Native qualification summary source correction

LAB_SELF_TEST_ONLY preflight; native environment qualification and integrated
qualification retain separate original evidence requirements.

Native18 at a2e9de7ecf2e655d52520adaae551e2c13656e50 produces two matching
698-observation captures:685PASS, oneFAIL and12BLOCKED. The original native
qualification receipt is present and qualifies the environment. The integrated
workflow rechecks this receipt and rejects undefined summary metadata before
producing integrated qualification or either original Rust result. The failed
workflow and every original member remain preserved.

Read-only replay of the frozen native verifier identifies exactly two undefined
fields: each repetition's coverage-extension returnedTransactions entry for
fixture-external has originalResult.noSendChange. Original observations already
retain this value with the reversible coverage-observation codec. JSON.stringify
drops the field from a derived unencoded summary, so the second strict canonical
comparison rejects the in-memory summary. Global canonical JSON remains strict.

Source7 encodes originalResult and malformedNativeResponses.result using the
existing tpnil-coverage-observation@1.0.0 envelope when deriving JSON receipts.
Exceptional values remain explicitly tagged and reversible. Predicate derivation
still consumes exact decoded native values; encoding never turns a malformed
response into a valid native return. Transaction ownership consumers continue
to use independently verified txid/rawHex fields. No consumer reads these
diagnostic result fields as ordinary native result objects.

Controls replay both actual raw extension reports and retain every transaction
result through serialization and decoding. Qualification summary copies pass
strict canonical serialization before and after JSON storage, while the original
report and qualification bytes remain unchanged. Undefined members and elements,
array holes, NaN, Infinity and negative zero retain explicit exceptional tags.

The457-input successor preserves the original4.8 criteria, all698IDs, e360e67
wallet, Go10 compatibility build, Rust3 oracle and all earlier frozen JSON. A
fresh bounded integrated native run must retain original native and integrated
qualification, both actual Rust results, complete independent frozen replay and
image reconstruction before readiness. No full BRC100 or certification claim is
issued. Full monetary/operator/agent/allocated-capacity costs remain unknown.
