# Independent Foundation recovery archive controls

One valid archive control passes and ten adversarial mutations reject: corrupt
ZIP, omitted complete log, unknown monetary cost forged as zero, absent component
receipt, forged certificate count, current producer executed in historical
replay, older replay reattributed to new source, carried source drift, forged
stored semantic receipt, and replacement review program. Each altered file has
its manifest digest rebound where relevant, so semantic checks must reject it.

The initial whitespace-specific historical-receipt mutation was a no-op; the
control refused to claim success. Its exact source and failure log are retained.
The corrected mutation accepts compact/spaced JSON but still requires changes.
The original106-file CI archive remains unchanged. No native session or new
qualification is established. Run python3 verify.py; optional --replay-controls
re-executes all controls only in a disposable copy.
