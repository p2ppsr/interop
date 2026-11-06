# Integrated component qualification — 42312093738

The exact GitHub artifact qualifies eight component lanes at source `56a1de95b01308fee612b80a49bfdf1b034a2d66`: 510 assertions, comprising 504 PASS and six retained upstream Go MessageBox FAIL observations. Both repetitions reproduce each failure. TypeScript MessageBox and the separately declared adapted Go participant pass. The storage lane contains eight isolated source/destination/repetition cells; the other seven lanes each run twice. This is component infrastructure qualification, not native wallet or complete BRC-100 conformance.

`integrated-lab.zip` is GitHub's original 1,832,015-byte artifact, SHA-256 `9bed5f9c354301132991cd167aa9bdee6080f13f857318fc3e497884aac0a41f`. No artifact member, including its original `verification.json`, was edited. `foundation-logs.zip` retains the raw logs for every Foundation job. GitHub run/job/artifact receipts and a portable offline-verification result accompany the archive; `provenance.json` binds every retained file. `qualification.json` identifies each lane, repetition, count and exact upstream finding.

Reproduce from the frozen source with its pinned dependencies installed, using a fresh extraction directory:

```sh
unzip journals/integrated-component-qualification/2026-11-06/42312093738/integrated-lab.zip -d out/recheck-42312093738
node scripts/verify-integrated-lab.mjs out/recheck-42312093738
```

The verifier checks the manifest, frozen inputs, matching repetitions and each child oracle. It recomputes logical storage projections, proof and metadata integrity, wallet boundary assertions, transport/replay properties, overlay/identity observations, messaging findings and independent Rust transaction/certificate evidence. Dependencies must be prepared before performing the offline verification; no service needs to be started to verify this pack. The local cross-platform verification passed without rewriting the CI host paths.
