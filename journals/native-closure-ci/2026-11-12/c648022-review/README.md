# Independent c648022 CI archive mutation review

The separate original45-file CI archive is unchanged. Its standalone verifier
passes. Five meaningful counterexamples reject: changed originalZIP bytes,
omitted core log despite a rebuilt inventory, unknown full cost rewritten to zero,
component child verification rewritten false, and suppression of the required39
certificate test count. Every mutation explicitly proves it changed bytes first.

This review has one positive and five negative controls; no native sessions.
verify.py checks both archives and reruns the unchanged retained mutation script
in an isolated original-shaped directory. No acceptance source is modified.
