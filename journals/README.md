# Laboratory journals

This directory holds verified evaluation bundles accepted for retention. Portable and native infrastructure qualification runs are recorded; no scored SUT evaluation has been issued. The foundation self-test generates local evidence through the [operator commands](../docs/operator-quickstart.md); candidate output defaults to ignored `out/` directories.

Published bundles identify their claim type, source revision, artifacts, observations, and outcomes. Official SUT results require qualified adapters and the publication conditions in the [evidence policy](../docs/evidence.md).

Tracked journal evidence is append-only. CI rejects modifications and deletions; corrections and replacement results are new bundles linked to earlier records. Independent checkpoints and mirrors provide verification beyond the repository administrator's control.

`intake/` retains INTAKE_REVIEW_ONLY reports with record and artifact digests. These reports record admission readiness and unmet criteria. They are append-only intake evidence, separate from executable SUT results and the self-test journal format.

Intake reports retain their complete review record and referenced evidence in `intake/objects/<sha256>`. CI verifies object integrity and recomputes readiness from the archived record. Large candidate binaries remain separately retained; archive verification reports that it has not rehashed those binary bytes.

`qualification/` retains portable application-serving bundles. `native-qualification/` retains signed-artifact, runner, UI, and local-bridge evidence from native infrastructure runs. Their verifiers recompute every finding from the retained raw objects. Neither journal issues conformance.

`component-qualification/` retains source-pinned execution evidence for supporting components such as Arcade, Merkle Service, and ChainTracks. Its verifier replays the declared semantic output assertions from retained process output. Component qualification is not an integrated-stack or SUT finding.

`runtime-qualification/` retains the digest-pinned Teranode profile, generated runtime manifest, and semantic probe result. Its verifier checks the source and image pins, profile identity, transaction evidence, and every declared assertion. Runtime qualification establishes the controlled service plane; it does not evaluate an admitted SUT.

`reference-qualification/` retains the locked synthesis package, deterministic profile, and complete reference result. Its verifier recomputes claim, profile, standards, assertion, replay, identifier, and minimum-topology checks without executing a network service. The result is `LAB_REFERENCE_PROFILE_ONLY`.

`synthesis-stack-qualification/` retains a self-contained joined run: runtime evidence, exact signed fixtures, generated digest-locked plans, four component qualifications, and the aggregate result. Its verifier checks every nested bundle and the transaction ancestry from controlled funding through board revision, UHRP advertisement, and LCH settlement. The result is `INFRASTRUCTURE_QUALIFICATION_ONLY`.
