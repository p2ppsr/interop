# Native conformance execution

This prospective closure uses the unchanged Yours Wallet 5.1.0 release with
[ITCVE-1 1.4.0](../../../itcves/ITCVE-1/1.4.0/README.md) and
[ISI-4 2.0.0](../../../programs/ISI-4/2.0.0/README.md). The plan freezes both
documents' machine-readable inputs and the source-located BRC-100 contract.
The historical 1.3.0 image and plans remain separate.

The workflow `ISI-4 Yours Wallet controlled-service run` accepts the
`integrated-native-conformance` profile. It builds the existing native and
integrated closures, then this Dockerfile. On the admitted Linux/amd64 runner,
the equivalent execution commands are:

```sh
node scripts/run-native-go-wallet.mjs IMAGE NEW_OUTPUT --conformance
node scripts/verify-native-integrated.mjs NEW_OUTPUT
```

Every repetition runs the original ToDo sequence, the isolated visible-consent
scenario, terminal rejection/recovery, native Wallet Backup replacement, the
joined component graph and the clause corpus. The clause corpus executes while
the explicitly authorized fixture certifier remains trusted; the existing
trust finalizer then restores the settings. The replacement storage stays alive
for the graph and is retired with the parent controlled services.

The Go fixture enables `--terminal-rejection-receipts` explicitly. Both the
primary and replacement storage identities declare `terminal-rejection-v1`.
Only a matching transaction ID, HTTP 400 and `REJECTED` verdict establish a
terminal rejection. Historical profiles retain the original status-only
behavior. This is a declared lab adapter correction, not a wallet modification.

Raw evidence lives in `evidence/conformance/`: `baseline-vectors.json`,
`permissions.json` and screenshots, `lifecycle.json`, `portability.json`,
`clauses.json`, `service-counterparts.json` and `result.json`. The enclosing
evidence manifest binds every file. Independent verification retains genuine
SUT failures, proves the metadata transaction against captured signed ancestry,
and prevents reference-wallet observations from qualifying native behavior.
Remaining comprehensive BRC-100 obligations remain explicit; successful
environment admission is not complete BRC-100 conformance or certification.

The runner requires committed source, two fresh containers, network-none,
read-only root filesystems, the native Chromium sandbox and scoped controlled
CA trust. The per-repetition bound is 900 seconds, plus 60 seconds for the host
deadline. It preserves every failed attempt, restores the runner namespace
setting, removes containers, and verifies wallet, service and database cleanup.

## Separately selected observer3 candidate

`integrated-native-conformance-pr368-cb3c2f2-observer-3` selects the separately retained
PR #368 engineering artifact at `cb3c2f2` under ITCVE-1 4.2.0 and ISI-4 5.2.0
with a new frozen observer plan. Earlier official
and candidate attempts remain bound to their original source and policies.
The plan retains 426 native observations, two fresh repetitions and the existing
900-second repetition/50-minute workflow limits. It is not an official wallet
release or complete BRC100 qualification.

The header probe now requests the exact positive funding height and header in
`controlled-header-1.0.0.json`. Only the declared header predicate changes;
errors remain recorded failures. Trust oracle 2 binds the specified
`publiclyRevealedKeyring` field to the original signed certificate, public anyone
proof and independent decryption. Final action-reference capture uses the active page
after a browser restart. Every change requires fresh native observations;
reference tests and corrected replay do not retroactively qualify an attempt.

The predecessor official run 43157433977 stopped after its first 426 observations
because final capture used a closed page. Its 381 PASS, 43 FAIL and two BLOCKED and
original 99 diagnostic mapping of 89 PASS and 10 FAIL remain unqualified. Candidate
run 43157437280 stopped at the invalid height-zero observer request before any
of the 99 conformance predicates were observed. Both failures and actual costs
are retained separately. The blocked coverage gate retains every unexecuted
obligation in the 306-row accountability inventory.
