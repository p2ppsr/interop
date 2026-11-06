# Native integrated qualification — 42312095022

[CI run](https://github.com/p2ppsr/interop/actions/runs/42312095022) executed frozen source
`56a1de95b01308fee612b80a49bfdf1b034a2d66` with the separate trusted-identity plan.
Two fresh unchanged Yours Wallet 5.1.0 identities pass 154 integration assertions
and 96 independent Rust assertions. The environment is qualified and both semantic
projections match. Baseline ToDo findings remain four PASS, two FAIL and two BLOCKED
per repetition; this is an experimental result, not full BRC-100 certification.

Both measured cache waits are 121000 milliseconds. Public wallet calls create the
encrypted settings token, discover the published identity and spend the temporary
token, restoring original settings and the originally empty basket. Exact artifacts,
Chromium sandbox, controlled CA, network-none, mined ancestry and cleanup verify.

`native-integrated.zip` is the original GitHub artifact 13550086449, 889156 bytes,
SHA-256 `0d0dd31ee9df2e513ac51fc4a17537f3f3343c94083b70327ad363fed0fab844`.
It matches the GitHub digest in `artifacts.json`. Raw run/jobs/artifact receipts and
all job logs are retained. `qualification.json` exactly copies the generated
integrated qualification; independent local replay passes every child oracle and
leaves all original ZIP members unchanged. The checker publication revision is
recorded separately; executable and oracle files match frozen runtime source.

After preparing the pinned dependencies in the [results report](../../../../docs/integrated-lab-results-2026-11-06.md),
run `node scripts/verify-published-integrations.mjs --semantic` from repository root.
It safely extracts the original ZIP and reproduces this exact qualification.
Earlier failed native attempts remain immutable in the adjacent attempt journals.
