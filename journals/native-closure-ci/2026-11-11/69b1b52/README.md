# Frozen 69b1b52 CI receipts

Foundation43165476505 and retained reevaluation43165476571 both completed
successfully at the exact source69b1b52f0c3d46cbfac91c78b38eb2e4dffbac99.
They consumed1,347 and98 observed job-seconds respectively.

Actual CI counts differ from the separate local validation: core163 PASS/1 SKIP;
synthesis716 PASS/10 SKIP. The separate Go job passes13 component tests; the
integrated job passes14 shutdown/listener,8 transport,15 service and1+14 Rust
tests. Python5 and typecheck pass. Dedicated frozen historical replays also pass.

The integrated evidence retains590 observations:584 PASS and6 known Go Message
Box failures. Publication replay covers14 accepted archives and16 failed attempts.
The two original native sessions remain180 PASS,99 FAIL and1 BLOCKED each under
the retained source4 replay. Its77 integration and48 Rust assertions pass per
session; no new native session or current candidate qualification is represented.

All original API receipts, complete job logs, original log ZIPs and5 artifacts
are retained. Artifact digests match GitHub metadata. The483 individual artifact
members have independent byte inventories. `verify.py` checks all stored and
uncompressed bytes, exact source/job times and the nonempty semantic receipts
reported by CI. It re-derives this summary from retained logs and API data; it
is not a new local execution of the frozen semantic verifiers.

This1,445-second increment advances the current completed cohort from10,350 to
11,795 job-seconds. The separate historical20,670-second cohort is not added
again. Active native43165501159 and later publication checks are excluded.
Unknown monetary charges, storage, operator effort, agent usage and owned capacity
remain null. Zero new paid-capacity reservations is not a full-cost-zero claim.

Run `python3 verify.py` from this directory or pass this directory as its argument.
