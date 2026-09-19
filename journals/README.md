# Laboratory journals

This directory holds verified evaluation bundles accepted for retention. No SUT evaluation has been recorded. The foundation self-test generates local evidence through the [operator commands](../docs/operator-quickstart.md); candidate output defaults to ignored `out/` directories.

Published bundles identify their claim type, source revision, artifacts, observations, and outcomes. Official SUT results require qualified adapters and the publication conditions in the [evidence policy](../docs/evidence.md).

Tracked journal evidence is append-only. CI rejects modifications and deletions; corrections and replacement results are new bundles linked to earlier records. Independent checkpoints and mirrors provide verification beyond the repository administrator's control.

`intake/` retains INTAKE_REVIEW_ONLY reports with record and artifact digests. These reports record admission readiness and unmet criteria. They are append-only intake evidence, separate from executable SUT results and the self-test journal format.

Intake reports retain their complete review record and referenced evidence in `intake/objects/<sha256>`. CI verifies object integrity and recomputes readiness from the archived record. Large candidate binaries remain separately retained; archive verification reports that it has not rehashed those binary bytes.
