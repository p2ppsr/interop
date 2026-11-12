# Native conformance closure: 12 November 2026

**Attempts 7, 8 and 9 stopped before any native wallet session.** Attempt 7 exceeded the selector's default Git output buffer while reading a pinned 3.2 MB fixture. The corrected selector passed in attempt 8, which was interrupted by a runner shutdown during final image export; the initiating cause is unknown. Through attempt 8, attempt 6 remains the last completed native corpus capture: each ITCVE-1@4.4.0 / ISI-4@5.4.0 repetition recorded 535 observations, with 432 PASS, 27 FAIL and 76 BLOCKED. Its independent parent rejected unresolved unmined ancestry; no qualified environment or Rust result was produced. The separately versioned ITCVE-1@4.5.0 completion profile has passed local and CI execution checks but has no completed native result. These checks do not establish complete BRC-100 conformance.

The original Yours 5.1.0 baseline remains unchanged: each repetition contains 280 observations, with 180 PASS, 99 FAIL and one BLOCKED. Attempt 6 maps those **original 99 findings** to **97 PASS and two FAIL**: the signed-value `listActions` conflict and an unexercised managed-change fixture. Attempt 4 previously recorded 98 PASS and one FAIL under its own frozen fixture. Two improvements are explicitly versioned namespace-oracle corrections; aggregate differences across the changed wallet, Go stack and fixtures are not counts of individual wallet fixes. The [earlier results report](native-conformance-results-2026-11-09.md) and every original failed artifact retain their original outcomes.

## Retained profiles and attempts

The 4.3 predecessor runtime source was committed at `b9bc8fb0eed238594ca7fe89aed9296f26a2760e`. Its [frozen plan](../infra/native/conformance/plan-pr368-coverage-1.json) binds 157 inputs and admits only the reviewed candidate and component chain. Attempt 5 executed publication source `c648022b2d9209b7350527bd5553d73e3e82a52c`; all 157 runtime inputs remained unchanged through the intervening CI test-harness corrections.

| Retained 4.3 component | Pinned identity |
| --- | --- |
| Native wallet | Yours Wallet `5.1.1-pr368.4a954ac`, source `4a954ac6bb0cb4403fb8ed548efd0cd8d1ba11b1`; [retained PR368 artifact and intake](../fixtures/artifacts/yours-wallet-pr368-4a954ac/) |
| Wallet artifact | SHA-256 `cd12b686c5295061bd4b727b32e17c3686e210fcdfa6aa2193790590458d9105`, 13,244,753 bytes |
| Go components | Overlay Services `v1.3.8`, ChainTracks `v1.4.8`, Wallet Toolbox `v0.191.4`, built with `go1.27.3`; [component lock](../synthesis/go/components.lock.json) |
| Go storage compatibility | Nine source-bound layers: storage-sync → portability → list-actions → native-contracts → batch-subjects → dust-accounting → merge-accounting → input-ancestry → sqlite-retry; [final recursive patch lock](../infra/adapters/storage-sqlite-retry/patch.lock.json) |
| Runtime admission | [ITCVE-1@4.3.0](../itcves/ITCVE-1/4.3.0/README.md), [ISI-4@5.3.0](../programs/ISI-4/5.3.0/README.md), explicit final `storageSQLiteRetryPatch` selection; no fallback through an older profile |

The wallet changes enforce public option and namespace contracts, preserve permission checks when an application requests immediate signing, and validate full signed transactions before honoring public transaction-ID-only responses. Standing allowances exclude only the wallet-authored reference of the current action, while retaining other pending and unsigned spending. Certificate proof uses the stored keyring revealer; normalized basket names and discovery permission flags reach the actual storage calls. These changes are engineering candidate source, not a released Yours update. The [candidate CI](https://github.com/yours-org/yours-wallet/actions/runs/43176871616) passed 261 tests with 1,769 expectations and built the four bundles; the retained intake binds the resulting archive, installed dependency patches and licenses.

The Go fixes preserve existing historical layers and add narrowly scoped successors. Native-contract handling supplies affirmative relinquishment results, proper query and permission semantics, wallet-owned action-reference labels and complete certificate tuple filtering. Batch submission validates every selected full transaction and requires every graph leaf to be selected before submitting any item, while retaining shared ancestors, order and per-item failure results. The same owned storage process exposes authenticated, identity-scoped output observations for independent state comparisons.

Dust accounting now treats omitted change as actual fee instead of crediting nonexistent change back to the wallet. Re-internalizing a second wallet payment updates the existing transaction's aggregate credit atomically. Caller-owned input recovery returns complete public proof ancestry without changing explicit known-transaction or transaction-ID-only contracts. The final SQLite layer retries a complete rolled-back transaction at most three times only for the typed `SQLITE_BUSY_SNAPSHOT` condition; it does not retry public wallet calls or turn arbitrary locked/database errors into success. The earlier reference failure returned a generic “database is locked” error with an unknown extended code. That sample remains failed; a later passing reference and the independently reproduced typed snapshot race do not establish its precise cause.

The observer changes also remain versioned: current-page capture survives permission restarts, action-reference evidence covers all owned storage counterparts, positive header and Board fixtures satisfy the candidate's public contract, and certificate discovery checks the actual public keyring representation. Independent final-ledger checks inspect recoverable returned transactions and reachable ancestry, including submissions during shutdown. Invalid public results can remain scored failures only when their precise failing predicate is independently reproduced; valid recoverable transaction bytes must still bind owned storage, declared funding and proof.

The completed qualification-workflow attempts below are all retained as failed or incomplete observations; attempts 7 and 8 never reached native execution:

| Attempt and immutable evidence | Native observations | Admission result | Observed job-seconds |
| --- | --- | --- | ---: |
| 1: [43143722884](https://github.com/p2ppsr/interop/actions/runs/43143722884), official 5.1.1, source `6b174e0`; [archive](../journals/integrated-native-attempts/2026-11-11/43143722884/README.md) | Both repetitions: 392 = 338 PASS / 45 FAIL / 9 BLOCKED. Original 99: 87 PASS / 10 FAIL / 2 BLOCKED. | Conditional diagnostic JSON key ordering disagreed during replay; all 84 conditional verdicts agreed. No qualification or Rust execution. | 2,130 |
| 2: [43157433977](https://github.com/p2ppsr/interop/actions/runs/43157433977), official 5.1.1, source `585211c`; [archive](../journals/integrated-native-attempts/2026-11-11/43157433977/README.md) | First repetition only: 426 = 381 PASS / 43 FAIL / 2 BLOCKED. Original 99: 89 PASS / 10 FAIL. | Final capture used a closed pre-restart page. No final record, second repetition or Rust result. Independent trust replay also rejects the raw integration claim. | 1,500 |
| 3: [43157437280](https://github.com/p2ppsr/interop/actions/runs/43157437280), candidate `7e39006`, source `585211c`; [archive](../journals/integrated-native-attempts/2026-11-11/43157437280/README.md) | No planned 426-predicate corpus. Fourteen preliminary vectors: 12 PASS / 2 FAIL. All original 99 are NOT_OBSERVED. | Candidate correctly rejected the observer's invalid height-zero positive header request. No final record, second repetition or Rust result. | 828 |
| 4: [43165501159](https://github.com/p2ppsr/interop/actions/runs/43165501159), candidate `cb3c2f2`, source `69b1b52`; [archive](../journals/integrated-native-attempts/2026-11-11/43165501159/README.md) | Both repetitions: 426 = 418 PASS / 6 FAIL / 2 BLOCKED. Original 99: 98 PASS / 1 FAIL. | Public returned BEEF omitted ancestry required by the frozen parent verifier. Independently hydrated stored bytes prove ownership, but do not repair the public proof. No Rust execution or qualification. | 2,256 |
| 5: [43195585984](https://github.com/p2ppsr/interop/actions/runs/43195585984), candidate `4a954ac`, source `c648022`; [archive](../journals/integrated-native-attempts/2026-11-12/43195585984/README.md) | Incomplete first repetition; no completed 535-predicate corpus or original-99 reevaluation. | The observer denied fresh-origin identity setup, then portability stopped with “Native wallet settings page is absent.” Actual resource cleanup completed; three missing success bindings prevented admission. No final record, second repetition, qualification or Rust result. | 1,180 |
| 6: [43216478235](https://github.com/p2ppsr/interop/actions/runs/43216478235), candidate `4a954ac`, source `1f9fe0f`; [archive](../journals/integrated-native-attempts/2026-11-12/43216478235/README.md) | Both repetitions: 535 = 432 PASS / 27 FAIL / 76 BLOCKED. Original 99: 97 PASS / 2 FAIL. Each raw integration report contains 77 PASS. | Independent parent rejects unresolved unmined ancestry. Ten component child replays pass, but no full native or integrated qualification and no Rust execution are admitted. | 2,285 |
| 7: [43253674251](https://github.com/p2ppsr/interop/actions/runs/43253674251), candidate `3e8a97f`, source `69386ef`; [archive](../journals/integrated-native-attempts/2026-11-12/43253674251/README.md) | Zero native sessions or observations; the 698-predicate corpus and original-99 comparison were not executed. | The committed-source selector raised `ENOBUFS` reading the 3,181,608-byte pagination fixture through the default 1 MiB output buffer. All build and native steps were skipped. No artifact ZIP, qualification or Rust result exists. | 22 |
| 8: [43262928941](https://github.com/p2ppsr/interop/actions/runs/43262928941), candidate `3e8a97f`, source `664e853`; [archive](../journals/integrated-native-attempts/2026-11-12/43262928941/README.md) | Zero native sessions or observations; original-99 comparison not executed. | Source admission, Linux Go build and all 64 Docker instructions passed. Runner shutdown interrupted image export with exit 143. Native, integrated execution and upload steps were skipped. No native artifact, qualification or Rust result exists; shutdown origin remains unknown. | 1,052 |

Attempt 4's six native failures were the signed-satoshi `listActions` response shape, two over-limit UTF-8 baskets, incomplete returned transaction proof, exact fee-inclusive allowance cap, and cumulative allowance. Its three accepted payments actually debited 114 satoshis against a 100-satoshi allowance. Each separate 77-predicate integration report contained 74 PASS and three BLOCKED because the uppercase Board protocol fixture prevented Board, LCH and revision execution. Those failures and absent results remain unchanged by the prospective fixes.

The 4.3 permission fixture uses the same initial native payment plus two upfront reserves: exactly three 10,000-satoshi owned outputs. Both permission modules run before customer transactions can alter coin selection. A real candidate-library-to-Go experiment publicly granted 100 satoshis and independently observed payment debits of 34, 36 and 30, including 23-satoshi fees, with the overflow denied. This supports the fixture design; it is not native browser or permission-UI evidence. Earlier cap100 failures and the intermediate cap114 policy remain intact.

The **535 observations per repetition** in the 4.3/4.4 profiles are the earlier426 slots plus109 predicates. They are neither 535 independent normative requirements nor 535 passing results. The new predicates map to 65 planning rows, of which 64 have prospective substantive behavior checks; the conflicting-remittance row retains an interpretation blocker. One additional reviewed discovery row reuses an existing trust assertion without adding a predicate. The [append-only coverage accounting](../programs/ISI-4/proposals/native-coverage-accountability-20261112-extension-delta.md) preserves the full 306-row inventory.

| New module | New predicates | Mapped planning rows |
| --- | ---: | ---: |
| Crypto, privileged reasons, baskets, discovery and relinquishment | 61 | 19 |
| Permission lifecycle and isolation extensions | 15 | 15 |
| Certificate branches | 11 | 9 |
| Transaction branches | 22 | 22 |
| Total | 109 | 65 |

At the 4.3 implementation stage, the remaining240 planning rows retained their prior classifications: 69 native-capability blockers, one missing public representation, 14 interpretation blockers, one real calendar-boundary requirement, 124 partial implementations and 31 earlier implementations awaiting current native proof. The additional conflicting-remittance row brings interpretation blockers to 15. Those64 behavior rows did **not** close the124 separately partial rows. The later4.5 completion inventory addresses119 of those124 prospectively, with five still separately unresolved; implementation counts do not qualify any row without native parent evidence.

Among the original99 findings in attempt6, the remaining pinned-contract conflict is `output.listActions`; the other FAIL is the managed-change fixture described above. The pinned BRC-100 declares a positive-only `SatoshiValue`, while the implementations expose signed net wallet movement. The exact attempt-4 shape-control trace returns −36; a separate setup query returns −1,032. Clamping or taking absolute values would corrupt spending semantics. The [source-based clarification proposal](../programs/ISI-4/proposals/brc100-list-actions-signed-value-clarification-20261112.md) records the conflict without relaxing the pinned oracle or claiming standards adoption.

Complete conformance also needs a supported distinct secondary keyring with actual user-presence and privileged-access lifecycle controls, finite-expiry behavior and observable expiry semantics, an applicable native binary wire ingress, and the real calendar transition required by the allowance tests. These cannot be closed by library codecs, injected clocks, private wallet-state mutation or substituting browser/reference results. `coverage.remaining-obligations` remains BLOCKED; a successful future attempt would still need a scoped qualification statement, not a claim that every BRC-100 obligation passes.

The earlier4.3 local source validation passed **173 core tests**, **1,079 synthesis tests**, five Python tests, type checking, catalog and standards checks. The synthesis suite explicitly skipped 23 environment-gated cases; those are not passes. The actual-Go admission checks have separate retained successful receipts. Publication verification checked 31 retained bundles: 14 accepted archives underwent semantic replay, while 17 failed-attempt archives retained their failure boundaries. The [engineering archive](../journals/native-closure-validation/2026-11-12-coverage1/README.md) preserves source snapshots, failed and passing experiments, final logs and independent reviews. These counts overlap focused suites and must not be added together.

CI history remains equally explicit. [Source-3 reevaluation 43157083517](https://github.com/p2ppsr/interop/actions/runs/43157083517) succeeded using retained evidence and zero new native sessions; each original repetition still has 180 PASS / 99 FAIL / 1 BLOCKED native observations, 77 PASS integration observations and 48 PASS Rust corpus-3 observations. Its original Rust corpus-2 result remains 42 PASS / six FAIL in the first repetition and NOT_EXECUTED in the second. In the same [CI archive](../journals/native-closure-ci/2026-11-11/10291cf/README.md), Foundation 43157083493 was canceled, 43157163535 failed cryptographic-test timeouts, certificate teardown and missing published logs, and 43158448284 passed the corrected Linux synthesis suite but still failed on those missing logs. All 42 omitted logs were recovered against their existing hashes; the final local publication checks pass without altering the original workflow outcomes.

The intermediate [ced590f candidate CI](https://github.com/yours-org/yours-wallet/actions/runs/43172062868) passed 207 tests with 1,367 expectations in 95 job-seconds; the later [4a954ac predecessor-candidate CI](https://github.com/yours-org/yours-wallet/actions/runs/43176871616) passed 261 tests with 1,769 expectations in 106 job-seconds. Completed use through candidate intake was 14,252 job-seconds. Subsequent CI used 1,411 job-seconds on `7bd1480`, 1,374 on `39ddc7b` and 1,500 on `c648022`; attempt 5 then used 1,180. Through native attempt 5, the new cohort totals **19,717 observed job-seconds**; the subsequent observer-recovery CI adds 1,497, bringing completed use to **21,214 job-seconds**. The earlier 20,670-job-second cohort is separate. These totals include failures and canceled work and must not be added to their component rows again. Reservations remain separate from this measured job time. Monetary charges, allocated owned capacity, operator effort and development-agent costs remain unknown; no zero-cost, accepted-pack cost or measured efficiency improvement is claimed.

[Foundation 43185320652](https://github.com/p2ppsr/interop/actions/runs/43185320652) failed the certificate reference test harness, while [source-5 retained-evidence reevaluation 43185320587](https://github.com/p2ppsr/interop/actions/runs/43185320587) succeeded on `7bd1480` without new native sessions. [Foundation 43189667881](https://github.com/p2ppsr/interop/actions/runs/43189667881) then failed two default test timeouts. The separately corrected [Foundation 43192958630](https://github.com/p2ppsr/interop/actions/runs/43192958630) passed on `c648022`: its Linux offline suite reported 1,040 synthesis passes and 65 explicit skips, with 39 certificate cases required separately in the integrated job. These counts overlap and are not additive. The [exact-source CI archive](../journals/native-closure-ci/2026-11-12/c648022/README.md) retains all job logs, artifacts, known component findings and the earlier failures. The successful source-5 reevaluation was not dispatched or charged again for the test-only commits.

To reproduce local engineering and retained-evidence checks from the repository root, use the pinned dependencies and toolchain:

```sh
npm test
npm --prefix synthesis run typecheck
npm --prefix synthesis test
python3 -m unittest discover -s test -p 'test_*.py' -v
npm run check
npm run qualify:standards
node scripts/verify-published-integrations.mjs --semantic
python3 journals/native-closure-validation/2026-11-12-coverage1/verify.py
python3 journals/integrated-native-attempts/2026-11-11/43165501159/verify.py
python3 journals/integrated-native-attempts/2026-11-11/43165501159/guard.py
```

The retained4.3/4.4 nine-layer Go host is reconstructed with `node scripts/prepare-storage-sqlite-retry-go.mjs`; its recursive lock checks pin every parent patch and postimage. Run its real-host admission cases from `synthesis` with `TPNIL_COVERAGE_GO_TESTS=1 npx vitest run test/native-coverage-go-admission.test.ts`. Archive integrity commands do not launch native wallets or qualify behavior; semantic replay must retain the original source, canonical invocation and nonempty child receipts. A fresh native execution follows the separately bounded work order rather than these local commands.

**Attempt-5 failure closeout is retained.** Its exact source and 1,180 job-seconds are recorded above; both complete native records, qualification and Rust outputs are absent. Independent replay passes the 29 base permission, eight permission and three lifecycle checks in their partial capture context. The extension executed exactly one identity call and received a trusted observer Deny; its 15 raw failure labels share that setup failure. Full five-context admission rejects the three-context partial capture. Browser, services and profile cleanup succeeded, while missing record, lifecycle and counterpart bindings prevented qualification. Partial permission traces must not be called a qualified 535-predicate pack or a new original-99 comparison. The attempt5 standalone63-row supplemental prototype remained unsealed with all63 observations BLOCKED because native/integrated parent evidence was missing. The separately source-bound4.5 partial-trace module is a later implementation; it does not qualify or rewrite that prototype. A later attempt must retain this failure, bind its own exact source and demonstrate the full shutdown, storage, funding and independent replay checks before scoped qualification can be claimed.

The separately versioned [coverage2 plan](../infra/native/conformance/plan-pr368-coverage-2.json) and [ITCVE-1 4.4 profile](../itcves/ITCVE-1/4.4.0/README.md) retain the same candidate, final Go chain and535 planned assertions. Recovery explicitly allows and verifies the fresh identity request, owns the exact extension settings page across the portability operation, preserves the primary error through shutdown failures, and adds the omitted expanded-profile evidence admission. Focused Chromium tests reproduce the two original observer defects and check the corrected paths; these are laboratory tests, not a completed native repetition. The executed4.3 plan, policies and original observations remain immutable.

Final observer-recovery validation passed181 core tests,1,080 synthesis tests with63 explicit skips, five Python packaging tests, typecheck, catalog and standards checks. The86 focused identity/portability controls,25 cleanup checks and17 Go/admission checks overlap these suites and are not additional totals. Publication verification replays14 accepted archives and retains18 failed-attempt archives. Its first pass rejected an unmanifested review sidecar; the corrected layout retains the original review bytes and failed check. The frozen-source materializer also passed an actual129MiB regression, rejected transformed or omitted Git blobs, and reproduced all2,499 exactc648 source files after the original buffered extraction failed. The [observer-recovery validation archive](../journals/native-closure-validation/2026-11-12-observer-recovery/README.md) preserves these checks. The exact-source source6 retained-evidence CI subsequently passed. Attempt6 later completed the535-observation capture but failed parent admission; none of these local or retained-CI results qualifies that capture.

The observer-recovery [Foundation run 43207730680](https://github.com/p2ppsr/interop/actions/runs/43207730680) failed only at historical portability source binding. Its Linux core 180 PASS/1 SKIP and synthesis 1,051 PASS/92 SKIP precede the archive failure; Go and integrated jobs pass. The source6 [reevaluation 43207730665](https://github.com/p2ppsr/interop/actions/runs/43207730665) passes with both original 280-observation projections unchanged at 180 PASS/99 FAIL/1 BLOCKED, plus 77 integration and 48 Rust assertions per repetition. These are retained observations, with zero new native sessions. The [CI archive](../journals/native-closure-ci/2026-11-12/e47873a/README.md) preserves all five original ZIPs, 483 members and 1,497 job-seconds.

The [portability replay correction](../journals/native-closure-validation/2026-11-12-portability-replay-recovery/README.md) executes the complete 1,520-file historical Git source with its locked synthesis dependencies. The producer, imported constants and transitive verifier inputs remain historical; the current producer is not executed. Both earlier failed engineering samples remain failed. Final validation passes 196 core tests, including 15 focused regressions, five Python tests, catalog checks and actual semantic replay. All 164 frozen native inputs and five source6 evaluator inputs remain byte-identical. The first draft’s passing tests did not establish this complete dependency boundary and remain explicitly rejected by independent review. A separate bounded CI recovery preceded native attempt6; its resulting failed native capture is retained above.


## Prospective completion and candidate intake

ITCVE-1@4.5.0 / ISI-4@5.5.0 adds 163 scoped predicates to the retained 535
identities: eight permission sequences, 39 basket boundaries, 25 pagination
checks, 20 certificate rejections, eight transaction branches and 63 trace
bindings. The [completion accounting](../programs/ISI-4/proposals/native-coverage-accountability-20261112-completion-delta.md) preserves the original planning classifications. The planned denominator is 698 per repetition. The six completion
modules require complete public observations, the source-owned provider
registry, independent storage/proof checks and final shutdown evidence. The
initial 50000-satoshi completion payment is independently derived and bounded;
no public-mainnet funding or broadcast is involved.

The successor preserves reference-only aborted transaction rows during
portability, reconstructs only the three exact proven control ancestors, uses
a surplus input that must produce real managed change, and retains undefined
values and sparse observations through a versioned codec. The new Go layer
checks caller-known input proofs, including every supplied Merkle proof, and
adds bounded read-only certificate, transaction-knowledge and action-query
observations. Raw RPC/SQL bytes and terminal observer failures remain available
after service cleanup. Action-query records currently establish authenticated
provider calls; they do not establish complete public CWI-to-storage query
membership.

The wallet candidate `5.1.1-pr368.3e8a97f` fixes prompt component state leaking
between queued requests. [CI43231477283](https://github.com/yours-org/yours-wallet/actions/runs/43231477283)
passed 264 tests and 1781 expectations, type checking, formatting and all four
production bundle checks. Linux PID namespaces and Seccomp-BPF isolation and
removal of the temporary executable-specific AppArmor profile were observed.
The [immutable intake](../fixtures/artifacts/yours-wallet-pr368-3e8a97f/)
binds source `3e8a97f3dd7953a10e3034381814f3f8aa8b01c0` to wallet ZIP
`9da87d79ac7ac70e3c5dee50451b2f0456b51f5e480b1be0925cd24a7707e184`.
The two earlier sandbox-setup CI failures remain failed and retained. This
candidate remains unreleased and is proposed in [Yours Wallet PR368](https://github.com/yours-org/yours-wallet/pull/368), which was open and unmerged at head3e8a97f when this draft was reviewed.

The initial completion plan at source69386ef froze391 inputs and all698 observation identities before
execution; the later source2 plan at664e binds394 inputs while preserving those identities. Local validation passes 204 core tests, 1705 synthesis tests with 90
explicit skips, five Python packaging tests, type checking, catalog and standards
checks. Semantic publication replay verifies 14 accepted integration archives
and 19 retained attempts without starting native sessions. The initial core
failure and the corrected worker-selector and historical-portability checks
remain in the [completion validation archive](../journals/native-closure-validation/2026-11-12-coverage-completion/README.md).
Historical portability executes its complete 1520-file source and locked
dependencies; an evolved current verifier neither replaces nor invalidates that
source. These local results establish engineering readiness, not native
qualification of the completion profile.

Completed new-cohort execution through this candidate intake totals 25120
job-seconds, including failed attempts. The earlier 20670-job-second cohort
remains separate. Currency charges, storage/egress, operator effort,
development-agent usage and allocated owned capacity remain unknown. The
previous work orders are closed; another native attempt requires a new exact
source freeze and bounded work order.

[Foundation 43249807860](https://github.com/p2ppsr/interop/actions/runs/43249807860)
and [source7 replay 43249807970](https://github.com/p2ppsr/interop/actions/runs/43249807970)
subsequently passed on exact source `69386efcea077e4bbe5b6e07f71fc6fe3b1f87f7`.
Linux core tests reported 203 PASS / 1 SKIP and synthesis reported 1675 PASS /
120 SKIP; dedicated integration jobs passed 42 certificate, 14 shutdown/listener,
eight transport and 15 service tests. The nine-lane component report retains
584 PASS and six upstream Go Messaging FAIL findings. The80 descendant-storage
replacement assertions included within those590 observations all pass. The [CI archive](../journals/native-closure-ci/2026-11-12/69386ef/README.md)
preserves five original ZIPs and 483 members, with independent integrity review.
Source7 retains the original native observations unchanged and executes no new
native session. Successful CI used 1826 job-seconds; attempt 7 added 22,
bringing completed cohort use to **26968 job-seconds**. The closed order permits
no retry. A source-selector recovery requires explicit successor bindings and
a separately bounded execution order; the original 693 plan remains unchanged.

The prospective [source2 plan](../infra/native/conformance/plan-pr368-coverage-3-source-2.json)
and [Rust binding](../infra/native/conformance/rust-graph-pr368-coverage-3-source-2.json)
preserve ITCVE-1@4.5.0 / ISI-4@5.5.0 and all 698 criteria. A shared Git reader
pins the committed blob identity and size, streams output through an owned
temporary file, checks the exact bytes and Git object hash, and enforces a
64 MiB per-input bound with cleanup. The old selector's buffer failure and a
mechanical replay using the corrected reader are retained separately.

An additional offline container audit found 84 missing pinned inputs in the
initial successor image definition, including policy and fixture files. The
corrected COPY chain includes all 394 inputs, and the base image ignore rules
allow the current wallet artifact. The source-closure regression rejects four
COPY omissions and retains the original 693 image's 82 missing inputs. This is
a source and packaging check, not a completed Linux native image or wallet run.

Final local recovery gates pass 214 core tests, 1705 synthesis tests with 90
skips, five Python tests, type checking, catalog/standards and publication
checks. All 3038 gate-input hashes remain stable through that invocation.
Independent review confirms unchanged criteria and original profile, catalog,
plan, Rust and source7 records. The new committed selector passed its actual Git read before publication and again in native attempt8. The [CI archive](../journals/native-closure-ci/2026-11-12/664e853/README.md) retains that committed-source receipt. Source7 was carried only after its complete evaluator, dependency, policy and original-artifact bindings were checked unchanged.


[Foundation 43260409136](https://github.com/p2ppsr/interop/actions/runs/43260409136)
passed on exact source `664e8539031109174e7233390262d76ca6c81240`. Linux core
tests reported 213 PASS / 1 SKIP, synthesis 1675 PASS / 120 SKIP, five Python
passes and 13 Go matrix passes. Dedicated certificate, shutdown/listener,
transport and service suites passed 42, 14, 8 and 15 tests respectively; these
counts overlap broader suites and are not additive. The integrated parent
verified 590 observations: 584 PASS and six retained upstream Go Messaging
FAIL findings. The80 descendant-replacement assertions included within those590 observations passed. Semantic
publication replay verified 14 accepted archives and 20 retained failed
attempts at that source. The [CI archive](../journals/native-closure-ci/2026-11-12/664e853/README.md)
retains three original ZIPs and 262 members. Its independent review rejects
verifier omission and coherent verifier substitution without changing the
original archive.

Native attempt 8 subsequently completed the corrected committed-source
selector, Linux Go storage validation and 64 final image instructions, then
received a runner shutdown signal while exporting layers. Check-run annotations
provide no initiating cause. Timestamps on explicitly skipped native and upload
steps do not show execution. The [independent failure review](../journals/native-closure-validation/2026-11-12-native8-pre-runtime-review/README.md)
checks the complete original APIs, logs and zero-artifact boundary. Its inventory
can be verified without native or semantic replay.

Foundation used 1410 job-seconds and native attempt 8 used 1052, bringing the
new cohort from 26968 to **29430 observed job-seconds**. Order 8 is closed; its
unused reservation does not authorize another attempt. A separately bounded
same-source infrastructure retry carries the successful Foundation and
unchanged source7 evidence. It introduces no source or criteria changes and
makes no new conformance claim. Full monetary, operator, development-agent,
storage and allocated-capacity costs remain unknown.

This draft stops at attempt8. Native attempt9, run43268040660 on the same664e source, is pending; its row, observed cost and qualification outcome must come only from its original terminal evidence and independent replay. No result is forecast here.


## Image export recovery

[Attempt 9](https://github.com/p2ppsr/interop/actions/runs/43268040660) ended
with a hosted-runner communication-loss annotation. Its last reported active
step was conformance-image export; the terminal API leaves subsequent steps
pending. The job used 3784 seconds, and no native artifact was uploaded. The
job-log endpoint returns 404 and the workflow log ZIP is empty. Accordingly,
wallet execution and host cleanup after the last reported state remain unknown;
no completed native repetition or qualification is available. The
[failed-attempt archive](../journals/integrated-native-attempts/2026-11-12/43268040660/README.md)
retains those limits and all available original evidence. Completed cohort use
is now **33214 job-seconds**, including this failed allocation.

The prospective source3 binding preserves all 698 criteria and the original
source2 plan. The image stages the same source and storage files separately,
then adds two filesystem layers to the identical integrated base. A Linux
audit compares the complete inherited `/work` and `/opt/tpnil` trees plus the
declared overlay: paths, file bytes, modes, ownership and symlink targets. It
also compares the complete inherited runtime configuration with only the two
declared environment additions. Build timestamps and inode numbers are outside
this packaging contract. The audit must pass before native execution; fewer
layers alone do not prove recovery or qualification.

Local source3 validation passes 217 core tests, 1705 synthesis tests with 90
explicit skips, type checking, five Python packaging tests and catalog/standards
checks. The new audit controls reject missing, extra, modified, permission- or
owner-changed files, symlink traversal and runtime configuration substitution.
Actual Linux image comparison and native repetitions remain pending.
