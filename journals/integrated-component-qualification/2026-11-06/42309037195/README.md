# Integrated component qualification — 42309037195

The exact GitHub artifact qualifies eight component lanes at source `28916cb6355f120c790a0cd97a5d97d7d52116c2`: 510 assertions, comprising 504 PASS and six retained upstream Go MessageBox FAIL observations. Both repetitions reproduce each failure. TypeScript MessageBox and the separately declared adapted Go participant pass. The storage lane contains eight isolated source/destination/repetition cells; the other seven lanes each run twice. This is component infrastructure qualification, not native wallet or complete BRC-100 conformance.

`integrated-lab.zip` is GitHub's original 1,822,465-byte artifact, SHA-256 `35e1f9d9b9bf765d7031bdbec9a28769acc92e58928e8af39051899a3912ea62`. No artifact member, including its original `verification.json`, was edited. `foundation-logs.zip` retains the raw logs for every Foundation job. GitHub run/job/artifact receipts and a portable offline-verification result accompany the archive; `provenance.json` binds every retained file. `qualification.json` identifies each lane, repetition, count and exact upstream finding.

Reproduce from the frozen source with its pinned dependencies installed, using a fresh extraction directory:

```sh
unzip journals/integrated-component-qualification/2026-11-06/42309037195/integrated-lab.zip -d out/recheck-42309037195
node scripts/verify-integrated-lab.mjs out/recheck-42309037195
```

The verifier checks the manifest, frozen inputs, matching repetitions and each child oracle. It recomputes logical storage projections, proof and metadata integrity, wallet boundary assertions, transport/replay properties, overlay/identity observations, messaging findings and independent Rust transaction/certificate evidence. Dependencies must be prepared before performing the offline verification; no service needs to be started to verify this pack. The local cross-platform verification passed without rewriting the CI host paths.
