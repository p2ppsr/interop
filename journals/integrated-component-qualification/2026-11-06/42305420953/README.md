# Integrated component qualification — 42305420953

The exact GitHub artifact qualifies eight component lanes at source `c768a577cd4bf2798deaf1fda07e942d590ae424`: 510 assertions, comprising 504 PASS and six retained upstream Go MessageBox FAIL observations. Both repetitions reproduce each failure. TypeScript MessageBox and the separately declared adapted Go participant pass. The storage lane contains eight isolated source/destination/repetition cells; the other seven lanes each run twice. This is component infrastructure qualification, not native wallet or complete BRC-100 conformance.

`integrated-lab.zip` is GitHub's original 1,831,373-byte artifact, SHA-256 `8b10581c727ea34ca5795fd83c0f7e83a9849cc9801f9a531f7ffd6077d4fcbf`. No artifact member, including its original `verification.json`, was edited. `foundation-logs.zip` retains the raw logs for every Foundation job. GitHub run/job/artifact receipts and a portable offline-verification result accompany the archive; `provenance.json` binds every retained file. `qualification.json` identifies each lane, repetition, count and exact upstream finding.

Reproduce from the frozen source with its pinned dependencies installed, using a fresh extraction directory:

```sh
unzip journals/integrated-component-qualification/2026-11-06/42305420953/integrated-lab.zip -d out/recheck-42305420953
node scripts/verify-integrated-lab.mjs out/recheck-42305420953
```

The verifier checks the manifest, frozen inputs, matching repetitions and each child oracle. It recomputes logical storage projections, proof and metadata integrity, wallet boundary assertions, transport/replay properties, overlay/identity observations, messaging findings and independent Rust transaction/certificate evidence. Dependencies must be prepared before performing the offline verification; no service needs to be started to verify this pack. The local cross-platform verification passed without rewriting the CI host paths.
