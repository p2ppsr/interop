# Implementation status

| Capability | Laboratory 0.3.0 |
| --- | --- |
| Reproducible compiled-webroot packaging | Implemented with fixed archive metadata; Python standard library |
| Strict JSON contract validation, digest verification, deterministic equality oracle | Implemented for laboratory self-tests |
| Content-addressed objects, hash-linked local journal, replay, prefix comparison | Implemented; not a distributed transparency service |
| Portable laboratory qualification execution | Implemented for canonical web-root extraction, logical-origin serving, HTTP assertions, raw evidence retention, and offline verification |
| Native macOS qualification execution | Implemented on clean hosted Apple-silicon macOS VMs; two retained BSV Desktop repetitions pass installation, initialization, mainnet-mode, and local BRC-100 bridge assertions |
| ISI requirement catalogs and machine-readable draft vector plans | Present; not executable SUT adapters |
| Four ISI reports on admitted SUTs | Not executed |
| Teranode/Arcade/Merkle regtest closure and mining | Architecture specified; integration driver not implemented |
| Overlay and storage HTTP drivers and independent state oracles | Contract specified; implementation pending |
| iOS/Android/Windows/Linux binary installation and automation | Profiles and adapters pending; macOS is the first implemented native platform |
| Canonical compiled ToDo tarball | Built from the nominated todo-ts revision; two local builds yielded identical packaged bytes; admission and independent build-environment qualification pending |
| Production-fidelity intake | Implemented record validation, evidence and artifact digest checks, and explicit readiness reporting |
| BSV Desktop 2.8.5 intake | Exact macOS arm64 DMG installed twice on clean VMs; signature, Gatekeeper, first-use initialization, mainnet response, authentication, and local bridge version verified; service coverage and fixture state remain unresolved |
| ISI-4 controlled-service mainnet-wallet execution | Policy adopted; native baseline works; runtime route control, fixture services, and independent ToDo driver/oracles remain outstanding |
| ISI-1 UHRP/CHIRP/LCH synthesis | Layered strategy adopted; pinned BRC-167/BRC-170 corpora and dependency-free digest, CHIRP identifier, LCH framing, segmented decryption, range, and tamper checks are executable as LAB_SELF_TEST_ONLY; service topology and scored run remain pending |
| GitHub enforced private branch protection | Unavailable on the current private-repository account plan |
| Signing, independent journal checkpoints, mirrors, certification marks | Not established |

The self-test core produces LAB_SELF_TEST_ONLY results. Infrastructure runs produce INFRASTRUCTURE_QUALIFICATION_ONLY results. Intake review produces INTAKE_REVIEW_ONLY readiness reports. SUT conformance and certification remain unissued. Draft catalogs record the fixtures, drivers, and normative decisions required for executable evaluation.

[Synthesis baseline research](research/synthesis-baseline.md) records the current standards, implementation candidates, and exploratory component-test results. [ISI-1 decision 0001](../programs/ISI-1/decisions/0001-layered-synthesis.md) defines the order in which those components become a complete laboratory scenario.

The infrastructure architecture and first portable lane are implemented under [ISI-4 decision 0003](../programs/ISI-4/decisions/0003-hybrid-laboratory.md). [Decision 0004](../programs/ISI-4/decisions/0004-native-qualification-lanes.md) admits the hosted macOS lane for infrastructure qualification after two clean repetitions. [Decision 0002](../programs/ISI-4/decisions/0002-native-infrastructure.md) continues to block scored ToDo execution until controlled-service routing, fixture state, reset, and independent oracle requirements are complete.
