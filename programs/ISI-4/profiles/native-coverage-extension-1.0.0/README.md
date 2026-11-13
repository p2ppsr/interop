# Prospective coverage extension

This standalone policy adds 61 independently computed predicates for 19 previously feasible inventory rows. It is not wired into ITCVE-1@4.2.0 or any existing native gate. Historical policies, findings and evidence remain unchanged.

The driver uses public calls and existing declared funding. It has 73 scheduled calls (90 hard cap), three expected signed fixture transactions, and at most eight signed transactions if every invalid creation is accepted. Every accepted invalid action remains a FAIL observation and its returned bytes remain subject to parent provenance checks.

The real TypeScript wallet → authenticated Go storage reference retained under `reference/` produced **16 PASS, 43 FAIL, 2 BLOCKED**. The 27 privileged failures reject a missing key manager before validating the reason. Sixteen basket failures accept invalid names or reject them only after a storage lookup. The two discovery checks lack native signed-settings evidence in that reference. Separate adversarial tests replay unchanged retained native trust observations to check the two metadata predicates. None of these engineering tests is native qualification.

The caller must supply original boundary, clause and completed trust2 observations. `verifyCoverageExtensionParentBindings` compares those anchors, the independent storage snapshot, and the full verified shutdown ledger. It traverses every reachable unmined ancestor, including rejected submissions, to protect the relinquished and reserved fixture outputs. Its returned transaction list still requires the parent's actor-specific ownership, funding and mined-proof checks; `transactionOwnershipAndFundingStillRequired` explicitly remains true.

Run the retained reference/mutation tests from `synthesis`:

```sh
node node_modules/vitest/vitest.mjs run test/native-coverage-extension.test.ts
```

After preparing the exact native-contract Go build, execute the actual public reference again:

```sh
TPNIL_TEST_COVERAGE_EXTENSION_GO=1 node node_modules/vitest/vitest.mjs run test/native-coverage-extension-go.test.ts
```

The explicit Go test retains each attempt, source hashes, raw observations and receipt under ignored `out/native-coverage-extension/go-test/`. It closes the authenticated clients before CPU-only verification. It never edits private native wallet state or dispatches a native run.
