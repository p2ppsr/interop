# Independent39ddc7b failed CI archive review

One valid control and five adversarial rejection cases pass: corrupt originalZIP,
missing mandatory corelog with rebound inventory, falsezero moneycost, falsechild
verifier receipt, and suppressed39-case certificate pass count. The original42-file
archive remains unchanged. These are archive selftests, not native observations.

The initial required-count mutation did not match ANSI-separated raw text and was
rejected by the test's byte-change guard before archive verification. That construction
failure is preserved; it is not a defect in the archive verifier.

Run python3 verify.py with sibling39ddc7b present. It checks every receipt and
the linked original archive, then reruns the exact mutation script in an isolated
temporary layout. No source change, native execution or qualification occurs.
