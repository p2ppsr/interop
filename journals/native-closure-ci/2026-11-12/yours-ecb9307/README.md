# Yours PR368 ecb9307 failed CI

Run43227590041 failed before the three browser regression tests could execute:
Chromium155 reported “No usable sandbox!” and aborted during launch. The existing
261 tests passed; the three new tests failed from one shared startup error.
There is no candidate artifact, native result or browser behavior conclusion.
The exact source and synthetic merge trees match. Raw API and complete job/run
logs are retained. The job consumed51seconds; cohort total25008seconds. Full
monetary costs remain unknown. Recovery must preserve the Chromium sandbox.
Run python3 verify.py for retained evidence and scope checks.
