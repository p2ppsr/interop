# Frozen source 6b174e0 CI and economic receipts

The Foundation run failed its historical oracle4 source-hash check. Its 133 core
tests, 438 synthesis tests (10 environment-gated skips), 12 Go component tests,
14 lifecycle checks, 8 transport tests, 14 service tests and 1 + 14 Rust tests passed.
Later offline-core steps were skipped. The completed integrated job retained
590 component observations: 584 PASS and the 6 known Go Message Box failures.
It semantically replayed 14 published archives and 13 attempts.

The separate retained-evidence workflow passed verification. Each original 5.1.0
repetition still contains 180 PASS, 99 FAIL and 1 BLOCKED native assertions.
Integration and Rust replay pass; no new native session occurred. Neither CI
success nor this archive closes native-wallet conformance gaps.

All raw API snapshots, original log ZIPs, complete job text and independent review
receipts are retained. Gzip copies use deterministic metadata; `manifest.json`
binds both stored and original bytes. Original review paths under `out/` identify
the acquisition locations; the manifest maps them to this public archive.

The 2 workflows account for 1,341 observed job-seconds, including all 1,228 seconds
of the failed Foundation workflow. Actual monetary charges, operator effort,
agent usage, owned-capacity allocation and full cost remain unknown. The prior
[wallet candidate CI receipt](../../../native-root-cause-audit/2026-11-11/candidate-ci-review.json)
records 106 additional job-seconds already accounted elsewhere; it is referenced
without duplication. This increment excludes the concurrent native run and later
attempts. No new paid capacity or reservation was created; that is not a zero-cost
claim or a measured 32-fold saving.

From this directory, run `python3 verify.py`. It verifies all archived byte digests,
job timings, source/checkouts, the precise failed stage and the complete nonempty
semantic receipts in the original job logs. It does not independently download
or replay qualification artifacts.
