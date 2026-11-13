# Observer3 source validation

This append-only archive records local engineering validation before the next native attempt. It does not qualify the cb3c2f2 wallet or replace either failed native sample. Final checks passed 164 core tests, 718 synthesis tests with eight explicit environment-gated skips, five Python tests, typecheck, catalog and standards checks. Publication replay independently verified 14 accepted archives and 16 failed-attempt archives.

The initial standalone archive-reader attempt failed because compressed predecessor filenames lacked a gzip suffix; its manifest, reader and failure are retained under `construction-initial/`. The final archive uses explicit gzip names and verifies successfully.

All intermediate logs remain separate. The first selection run exposed an ASI test bug and missing container provenance; the final core run includes their fixes. The second selection log began before the Docker correction and is not represented as a final pass. Intermediate transaction2 typecheck failures occurred during the profile-union transition; final typecheck passed. False-pass reproductions and their corrected controls are retained.

The source snapshot binds all 105 plan inputs, the paired Rust and source4 replay manifests, and every changed tracked or untracked source/configuration file, excluding bulk journals and artifact archives. The final source commit is recorded separately after this content snapshot is committed. Seven predecessor plans, policies and intake bytes are retained exactly from source585211c.

Predecessor-derived predicate diagnoses, current-spec signed monetary codec analysis, trust2/state2 interpretation corrections, and actual TypeScript-to-Go reference checks are explicitly labeled. They are not new native observations. Yours local tests and CI intake/preparation reviews establish a new engineering artifact identity only. Unknown monetary, operator, agent and owned-capacity costs remain unknown.

Run `python3 verify.py` from any location to check every retained byte, deterministic gzip decoding, source/plan bindings, final test counts, predecessor bytes and four hostile manifest mutations.
