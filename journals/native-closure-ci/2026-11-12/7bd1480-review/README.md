# Independent review of retained7bd CI archive

This separate append-only receipt preserves one valid archive control and five
adversarial rejections: corrupt ZIP bytes; omitted mandatory core log with rebound
inventory; falsely zero full cost; false component child receipt; and false retained
reevaluation verifier receipt. The original70-file archive remains unchanged.

The first mutation harness used a whitespace-sensitive replacement which changed
no bytes in the compact reevaluation JSON. Its failure is retained explicitly and
does not demonstrate an archive-verifier flaw. The corrected harness requires an
actual byte change and matches JSON whitespace. All five actual mutations reject.

The source7bd CI failure, unreported tests, known component failures and unknown
costs remain unchanged. These are verifier controls, not native wallet observations.

Run python3 verify.py. The sibling7bd1480 archive is required. Verification checks
all receipt bytes, verifies that original archive, then reruns the exact recorded
mutation script in an isolated temporary layout. It creates no native session.
