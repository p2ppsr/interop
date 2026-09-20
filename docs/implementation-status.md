# Implementation status

| Capability | Laboratory 0.3.0 |
| --- | --- |
| Reproducible compiled-webroot packaging | Implemented with fixed archive metadata; Python standard library |
| Strict JSON contract validation, digest verification, deterministic equality oracle | Implemented for laboratory self-tests |
| Content-addressed objects, hash-linked local journal, replay, prefix comparison | Implemented; not a distributed transparency service |
| Portable laboratory qualification execution | Implemented for canonical web-root extraction, logical-origin serving, HTTP assertions, raw evidence retention, and offline verification |
| ISI requirement catalogs and machine-readable draft vector plans | Present; not executable SUT adapters |
| Four ISI reports on admitted SUTs | Not executed |
| Teranode/Arcade/Merkle regtest closure and mining | Architecture specified; integration driver not implemented |
| Overlay and storage HTTP drivers and independent state oracles | Contract specified; implementation pending |
| iOS/Android/Windows/macOS/Linux binary installation and automation | Hybrid architecture selected; first disposable macOS arm64 guest lane is being provisioned; native admission incomplete |
| Canonical compiled ToDo tarball | Built from the nominated todo-ts revision; two local builds yielded identical packaged bytes; admission and independent build-environment qualification pending |
| Production-fidelity intake | Implemented record validation, evidence and artifact digest checks, and explicit readiness reporting |
| BSV Desktop 2.8.5 intake | macOS arm64 DMG digest and static signature integrity verified; source configuration inventory recorded; runtime admission blocked |
| ISI-4 controlled-service mainnet-wallet execution | Policy adopted; isolated native runner, runtime route verification, fixture services, and independent ToDo driver/oracles remain outstanding |
| GitHub enforced private branch protection | Unavailable on the current private-repository account plan |
| Signing, independent journal checkpoints, mirrors, certification marks | Not established |

The self-test core produces LAB_SELF_TEST_ONLY results. Infrastructure runs produce INFRASTRUCTURE_QUALIFICATION_ONLY results. Intake review produces INTAKE_REVIEW_ONLY readiness reports. SUT conformance and certification remain unissued. Draft catalogs record the fixtures, drivers, and normative decisions required for executable evaluation.

The infrastructure architecture and first portable lane are implemented under [ISI-4 decision 0003](../programs/ISI-4/decisions/0003-hybrid-laboratory.md). Native wallet and ToDo execution remains blocked by [decision 0002](../programs/ISI-4/decisions/0002-native-infrastructure.md) until the macOS guest completes installation, reset, routing, automation, and evidence-capture qualification. Static intake findings remain valid within their recorded scope.
