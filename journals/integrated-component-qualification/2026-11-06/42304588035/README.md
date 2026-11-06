# Integrated component qualification — 42304588035

The exact GitHub artifact qualifies eight component lanes at source `9b94f0ec358093c164119b5973b3e42eded4999d`: 510 assertions, comprising 504 PASS and six retained upstream Go MessageBox FAIL observations. Both repetitions reproduce each failure. TypeScript MessageBox and the separately declared adapted Go participant pass. The storage lane contains eight isolated source/destination/repetition cells; the other seven lanes each run twice. This is component infrastructure qualification, not native wallet or complete BRC-100 conformance.

`integrated-lab.zip` is GitHub's original 1,831,018-byte artifact, SHA-256 `d47fc2f2b391e8ca6f06e1f7fb1b736ee5e63a2f6299d7da1cb46a0435daa860`. No artifact member, including its original `verification.json`, was edited. `foundation-logs.zip` retains the raw logs for every Foundation job. GitHub run/job/artifact receipts and a portable offline-verification result accompany the archive; `provenance.json` binds every retained file. `qualification.json` identifies each lane, repetition, count and exact upstream finding.

Reproduce from the frozen source with its pinned dependencies installed, using a fresh extraction directory:

```sh
unzip journals/integrated-component-qualification/2026-11-06/42304588035/integrated-lab.zip -d out/recheck-42304588035
node scripts/verify-integrated-lab.mjs out/recheck-42304588035
```

The verifier checks the manifest, frozen inputs, matching repetitions and each child oracle. It recomputes logical storage projections, proof and metadata integrity, wallet boundary assertions, transport/replay properties, overlay/identity observations, messaging findings and independent Rust transaction/certificate evidence. Dependencies must be prepared before performing the offline verification; no service needs to be started to verify this pack. The local cross-platform verification passed without rewriting the CI host paths.
