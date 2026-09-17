# Implementation status

| Capability | Foundation 0.1.0 |
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
| BSV Desktop regtest setup | Blocked pending supported offline configuration verification or upstream release |
| GitHub enforced private branch protection | Unavailable on the current private-repository account plan |
| Signing, independent journal checkpoints, mirrors, certification marks | Not established |

The executable core produces LAB_SELF_TEST_ONLY results. SUT conformance and certification remain unissued. Draft catalogs record the fixtures, drivers, and normative decisions required for executable evaluation.
