# Independent e47873a CI archive review

The linked146-file CI archive remains unchanged. One positive control and seven
adversarial mutations pass: corrupt ZIP, removed core log with rewritten inventory,
false zero full cost, false component child receipt, false required certificate
count, false retained reevaluation receipt, and relabeled failed Foundation.

The first added retained-receipt mutation was a no-op because the raw JSON is
compact. The explicit byte-change guard rejected that construction. Its exact
checker and failure are retained; the corrected full eight-control run is separate.
No CI/native rerun occurred, and no failed workflow is reclassified.

verify.py checks this exact review inventory and linked archive, and validates the
retained controls. Use --replay-controls for an explicit isolated reproduction;
the default does not unnecessarily repeat already completed adversarial tests.
