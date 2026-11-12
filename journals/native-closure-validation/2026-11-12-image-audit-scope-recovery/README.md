# Image audit scope recovery

Source4 exported its two-layer image in5.9seconds but failed its audit on an expected `/opt` parent outside the collector's declared roots. That original result remains FAIL with wallet execution skipped. Source5 aligns the expected/collected roots and retains bounded diagnostics without changing any native criterion.217core tests, type/catalog checks and retained Linux comparison pass. The unchanged synthesis1705PASS/90SKIP run remains in image-export-recovery; the latest actual Linux CI source4 reported1675PASS/120SKIP.

The packaging replay covers all71431retained Linux entries, uses the independently emitted Linux build manifest for generated storage inputs, explicitly excludes host-only untracked Python caches, and rejects the original extra-parent mismatch and a seeded deletion. It is not a native qualification. A fresh source5 Linux image audit and native run are still required.

Run python3 verify.py for the immutable byte inventory and retained Linux comparison. It launches no wallet, service or Rust process.
