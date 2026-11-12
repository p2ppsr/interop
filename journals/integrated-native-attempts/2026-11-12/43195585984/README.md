# Native attempt5: retained observer execution failure

[Run43195585984](https://github.com/p2ppsr/interop/actions/runs/43195585984)
failed on source c648022b2d9209b7350527bd5553d73e3e82a52c with the exact
PR368 4a954ac engineering candidate, ITCVE-1@4.3.0 / ISI-4@5.3.0.
The original ZIP and all91 extracted members remain byte-for-byte intact.
This is an unqualified partial attempt, not an official-release qualification.

The primary failure is the portability observer's assumption that an extension
settings page remains open after the permission prelude's browser restarts and
page cleanup. Its explicit error is “Native wallet settings page is absent”.
The outer worker reports cleanup failure because the shutdown receipt cannot bind
record.json and two later module files. Actual browser, service and profile
cleanup all completed; missing mandatory evidence still prevents admission.

The extension permission module executed only its initial identity request.
Its observer selected trusted Deny on that fresh-origin permission prompt.
The public request correctly rejected, the report identity remained empty, and
all15 raw assertion slots recorded their shared “Unknown point format” failure.
No later extension scenario executed; these are not15 independently observed
wallet defects. Frozen-source replay preserves all15 FAIL slots unchanged.

Independent partial replay reproduces29 baseline permission PASS,8 permission
PASS and3 lifecycle PASS. Applying the complete profile's five-context prerequisite
produces15 PASS/14 FAIL in the baseline permission evaluator because only three
contexts were opened. The partial29-pass result is not whole-profile admission.
There is no complete535 report, original99 reevaluation, second repetition,
qualification, integrated result or Rust sidecar. None is inferred or fabricated.

Four separately labelled real-Chromium laboratory controls reproduce the default
identity denial and missing-page prerequisite, plus scoped positive controls.
These are observer self-tests, not additional native qualification. Initial local
snapshot-buffer and self-test startup failures are retained alongside their scoped
corrections. The immutable c648 source inventory and exact dependency receipts
bind the replay; the167MB source tree is not duplicated in this archive.

The run used1180 job-seconds including preparation, the122.913-second worker,
failure capture, upload and cleanup. The completed new cohort is19717 seconds;
historical20670 remains separate. Monetary, operator, development-agent,
allocated-capacity, storage and egress costs remain unknown. Zero accepted native
customer packs or measured savings are claimed.

Run python3 verify.py for exact inventory, originalZIP/API/time/count/scope checks.
It verifies retained replay receipts; it does not produce new native observations
or silently replace the frozen evaluator. Future recovery requires a new exact
source and bounded work order, while this failed attempt remains unchanged.
