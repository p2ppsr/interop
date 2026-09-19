# Implementation status

| Capability | Laboratory 0.2.0 |
| --- | --- |
| Reproducible compiled-webroot packaging | Implemented with fixed archive metadata; Python standard library |
| Strict JSON contract validation, digest verification, deterministic equality oracle | Implemented for laboratory self-tests |
| Content-addressed objects, hash-linked local journal, replay, prefix comparison | Implemented; not a distributed transparency service |
| ISI requirement catalogs and machine-readable draft vector plans | Present; not executable SUT adapters |
| Four ISI reports on admitted SUTs | Not executed |
| Teranode/Arcade/Merkle regtest closure and mining | Architecture specified; integration driver not implemented |
| Overlay and storage HTTP drivers and independent state oracles | Contract specified; implementation pending |
| iOS/Android/Windows/macOS/Linux binary installation and automation | Capability contract specified; runners not provisioned |
| Canonical compiled ToDo tarball | Built from the nominated todo-ts revision; two local builds yielded identical packaged bytes; admission and independent build-environment qualification pending |
| Production-fidelity intake | Implemented record validation, evidence and artifact digest checks, and explicit readiness reporting |
| BSV Desktop 2.8.5 intake | macOS arm64 DMG digest and static signature integrity verified; source configuration inventory recorded; runtime admission blocked |
| ISI-4 controlled-service mainnet-wallet execution | Policy adopted; isolated native runner, runtime route verification, fixture services, and independent ToDo driver/oracles remain outstanding |
| GitHub enforced private branch protection | Unavailable on the current private-repository account plan |
| Signing, independent journal checkpoints, mirrors, certification marks | Not established |

The self-test core produces LAB_SELF_TEST_ONLY results. Intake review produces INTAKE_REVIEW_ONLY readiness reports. SUT conformance and certification remain unissued. Draft catalogs record the fixtures, drivers, and normative decisions required for executable evaluation.
