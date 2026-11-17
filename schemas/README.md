# Machine-readable contracts

The JSON Schema documents use Draft 2020-12. The offline core validates the small explicit keyword subset used here (`type`, `const`, `enum`, `properties`, `required`, `additionalProperties`, `items`, `minItems`, `minLength`, `pattern`, `minimum`, `maximum`). Unsupported schema keywords raise an error. Conformance plans for production SUTs will need a separately versioned schema and executor.

`catalog.schema.json` validates draft program design catalogs. `self-test-plan.schema.json` and `self-test-observations.schema.json` accept only LAB_SELF_TEST_ONLY results.

Canonical encoding **TPNIL-JSON-1** is UTF-8 JSON without trailing whitespace; object keys sort by JavaScript UTF-16 code-unit order, arrays retain order, strings use JSON escaping without Unicode normalization, and numbers are safe integers only. Validation rejects duplicate keys, negative zero, fractional or unsafe numbers, invalid UTF-8, and unpaired UTF-16 surrogates. TPNIL-JSON-1 has its own versioned contract, distinct from RFC 8785. Raw evidence may be arbitrary bytes; canonical restrictions apply only to control documents and JSON evidence projections.

`program-index.schema.json` selects independently versioned current programs. `intake.schema.json` defines version 2.0.0 production-fidelity reviews with separate technical criteria and evidence-backed permissions. `intake-v1.schema.json` preserves version 1.0.0 for retained reviews. The verifier dispatches by record version and retains the original report shape for old evidence.

`qualification-plan.schema.json` defines portable service-origin qualification. `native-qualification-plan.schema.json` binds a native artifact and its platform admission expectations. Both produce infrastructure qualification findings and cannot issue SUT conformance.

`component-qualification-plan.schema.json` binds an external source revision, an argument-vector command, and semantic output assertions. The runner retains stdout, stderr, source state, tool versions, and the replayable result as content-addressed objects. These findings qualify supporting infrastructure only.

ISI-4 wallet-run and native-observation records use explicit `tpnil-isi4-*` schema identifiers and the verifier in `src/sut-evidence.mjs`. It checks the claim and program boundary, all eight vector outcomes, the exact evidence file set, sizes and SHA-256 digests. The wallet runner additionally compares the semantic projection across clean repetitions.

The additive `catalog-v2` and `program-index-v2` contracts use schemaVersion `0.2.0` and register optional ISI-6; original v0.1 contracts remain unchanged and dispatched by version. `wallet-profile-plan` and `wallet-profile-record` bind ISI-6 engineering observations to a frozen catalog/oracle and exact evidence digests. The evaluator cannot issue SUT conformance or certification.
