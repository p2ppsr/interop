# Native closure CI evidence through 10291cf

This archive retains four completed CI runs and the independent replay of their
artifacts. It starts **zero new native wallet sessions**. The two separate native
attempts are outside this archive and its cost increment.

| Run | Source | Observed outcome | Job seconds |
| --- | --- | --- | ---: |
| [43157083493](https://github.com/p2ppsr/interop/actions/runs/43157083493) | e7a4b536 | Superseded Foundation run canceled; all three job logs retained | 244 |
| [43157083517](https://github.com/p2ppsr/interop/actions/runs/43157083517) | e7a4b536 | Retained native evidence reevaluation succeeds; native conformance remains FAIL | 92 |
| [43157163535](https://github.com/p2ppsr/interop/actions/runs/43157163535) | 585211c | Foundation fails on test-harness timeouts/teardown and missing published archive logs | 1,227 |
| [43158448284](https://github.com/p2ppsr/interop/actions/runs/43158448284) | 10291cf | Corrected Linux synthesis tests pass; Foundation still fails on the same missing archive logs | 1,160 |

The source-3 reevaluation uses plan SHA256
`2308c7f5fdbc717029e4a654f09b5938afb4992298e299ac26ae93ae95f560ea`.
Its original artifact has **220 ZIP members**, including **186 original native
members** and the unchanged embedded original native ZIP. Exact-source semantic
replay and all 16 nonempty child receipts pass. Each original repetition retains
180 PASS / 99 FAIL / 1 BLOCKED native assertions, 77 PASS integration assertions
and 48 PASS Rust corpus-3 assertions. Original Rust corpus-2 remains 42 PASS / six
FAIL in repetition 1 and NOT_EXECUTED in repetition 2. Complete BRC-100
conformance remains false.

Both Foundation runs produce component packs with 584 PASS / six FAIL out of
590 assertions across nine lanes and 30 isolated executions. Independent replay
at each recorded source validates all 16 child receipts. The six findings are
the three unchanged raw-Go messaging payment failures in each repetition. Each
run's Go component job also passes 13 tests covering all eight TypeScript/Go
component combinations. The separate descendant artifacts contain 51 members
identical to the embedded descendant evidence; each complete component ZIP has
193 members. These are infrastructure and reference results, not native wallet
qualification.

At 585211c, synthesis records 622 PASS, five timed-out tests and ten skipped
tests; the certificate suite also fails during teardown after all 32 cases pass.
The [test-only correction](../../../native-closure-validation/2026-11-11-ci-harness/README.md)
retains every assertion, adds bounded 30-second budgets to five expensive graph
checks and closes the real certificate fixture before CPU-only replay tests.
Linux at 10291cf then passes all 46 synthesis files: 627 PASS, ten skipped.

Both Foundation runs subsequently fail strict archive inventory verification.
Exactly 42 existing raw logs, totaling 147,876 bytes, were bound by the unchanged
historical attempt manifest but omitted from Git by the `*.log` rule. The audit
checks all 28 published manifests against the committed tree and verifies every
missing local byte against its existing hash. The failure and original records
remain unchanged. This archive does not claim that the publication correction
has passed a later CI run.

[The cost increment](cost.json) records **2,723 observed job-seconds across ten
jobs**, including canceled and failed jobs. Prior cohorts and native attempts
43157433977 and 43157437280 are excluded to avoid double counting. Actual
monetary, owned-capacity, operator and development-agent costs remain unknown;
no cost-per-accepted-pack or improvement claim is made.

Original artifact ZIPs and complete workflow log ZIPs are retained. JSON/log
records use deterministic gzip with raw and stored digests in
[the manifest](manifest.json). The existing eight-record test-harness archive is
referenced without duplication. The first local component-review wrapper's
receipt-schema error is retained alongside its corrected exact-schema replay.
The separate lineage and source-plan reviews are also retained.

From the repository root, run
`python3 journals/native-closure-ci/2026-11-11/10291cf/verify.py` for byte integrity,
GitHub artifact digest, count, reference and job-duration checks. Full semantic
replay scripts and their original receipts are retained in the per-run records;
the integrity checker does not launch services or qualify native behavior.
