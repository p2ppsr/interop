# Go Wallet Storage listActions compatibility revision

This separately selected build layers on the immutable storage-portability and
storage-sync patches for released `go-wallet-toolbox v0.191.4`. ITCVE-1@4.0.0
requires this revision. Historical profiles keep their existing binaries and
patch locks. Neither the upstream pin nor earlier patch bytes change.

The patch preserves requested empty optional arrays while omitting unrequested
arrays, returns an empty output tags array, reads source locking scripts
independently of output locking scripts, always reports the actual transaction
input sequence, and supplies a truthful description for newly generated change
outputs. Caller descriptions are preserved. Missing raw transactions with known
inputs fail rather than reporting fabricated sequence values. Existing stored
change descriptions are not rewritten.

Action satoshis retain their signed net-balance meaning, including zero. The
pinned BRC-100 positive SatoshiValue wording conflicts with both wallet
implementations' net-balance behavior; this patch does not take an absolute
value, clamp balances, or change the clause oracle to conceal that conflict.

Run `node scripts/prepare-storage-list-actions-go.mjs`. The preparer verifies the
released module checksum and every parent/patch/file digest, executes the Go
host suite, existing Sync/BRC40 tests and the complete affected WDK/actions
package suites, then emits `out/itcve-go-storage-list-actions` and its build
manifest. New source regressions exercise all eight script flag combinations,
non-default sequence values, empty/omitted arrays, tags, caller/change metadata
and unchanged signed amounts. Host engineering tests do not constitute native
wallet qualification; that requires the separately admitted profile and runs.

Upstream release/main inspection on 2026-11-11 found v0.191.4 still latest and
main c26b8eedcc5eba4d7d38bbb2f4f30544c7e7465f byte-identical for all four affected
implementation files. Retire this compatibility revision when an upstream
release provides equivalent behavior, with a separately pinned profile and the
same regression and native qualification evidence. Rollback selects the prior
profile; it never reinterprets old evidence under this revision.
