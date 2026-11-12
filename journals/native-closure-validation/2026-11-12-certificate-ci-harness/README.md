# Certificate CI harness correction

Foundation run43185320652 at source7bd1480 failed before the certificate
reference suite completed. Its offline job installed only the synthesis
closure, while the reference also requires the integration service closure.
An isolated copy of that exact source reproduced the missing
`mongodb-memory-server` dependency. Vitest then obscured the child error by
parsing a multiline template in the pinned tsx loader as an inline source map.
The original CI failure and both independently reproduced causes are retained.

The correction requires the entire existing39-case reference suite in the
integrated job after its locked dependencies are installed. The offline job
explicitly skips that suite. A child failure still fails the test, retains its
original output and error metadata, and raises a fresh contextual error that
the test runner can render. A later assertion failure also keeps the completed
reference evidence; successful suites retain their cleanup behavior. Both CI
jobs upload retained failure diagnostics on every outcome.

Final local validation passed1043 tests with62 explicit skips across1105 cases.
The separate dependency-complete certificate run passed all39 cases. Three
subprocess diagnostic tests are included in the full1043 and in the focused42
result; these totals must not be added together. The deliberately failing
subprocess and post-reference assertion controls remain failures and prove
that the correction preserves failed status and evidence. Typecheck passed.

All157 runtime inputs and the535-predicate native plan, Rust binding and source5
reevaluation plan remain unchanged. This archive records local engineering
validation, with zero new native sessions and no native qualification claim.
The earlier failed CI archive remains independently linked by exact hashes.

All61 files indexed by the original review are retained with stored and decoded
SHA-256 digests. That review captured only the first160 bytes of the then-running
full synthesis log. Those exact bytes are preserved as its reviewed prefix; the
completed365-byte log is a separate final record. Early incomplete local source
snapshot experiments and the first test-only typecheck error remain distinct
from the successful reproduction and final checks. Source snapshots include
the four corrected harness files, the original source, dependency code and
licenses needed to inspect the parser defect. Complete cloned source trees and
installed dependency binaries are excluded.

Run `python3 verify.py` from any directory to verify the archive, its linked CI
failure, original Git source and unchanged runtime input hashes. Add
`--current-source` to compare the four corrected files with the working tree,
and `--staged` to require complete publication in the Git index. This verifier
checks retained bytes and validation receipts; it does not rerun native tests.
