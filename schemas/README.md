# Machine-readable contracts

The JSON Schema documents use Draft 2020-12. The offline core validates the small explicit keyword subset used here (`type`, `const`, `enum`, `properties`, `required`, `additionalProperties`, `items`, `minItems`, `minLength`, `pattern`, `minimum`, `maximum`). Unsupported schema keywords raise an error. Conformance plans for production SUTs will need a separately versioned schema and executor.

`catalog.schema.json` validates draft program design catalogs. `self-test-plan.schema.json` and `self-test-observations.schema.json` accept only LAB_SELF_TEST_ONLY results.

Canonical encoding **TPNIL-JSON-1** is UTF-8 JSON without trailing whitespace; object keys sort by JavaScript UTF-16 code-unit order, arrays retain order, strings use JSON escaping without Unicode normalization, and numbers are safe integers only. Validation rejects duplicate keys, negative zero, fractional or unsafe numbers, invalid UTF-8, and unpaired UTF-16 surrogates. TPNIL-JSON-1 has its own versioned contract, distinct from RFC 8785. Raw evidence may be arbitrary bytes; canonical restrictions apply only to control documents and JSON evidence projections.
