# Native conformance closure: 12 November 2026

**Attempt11 completed both698-observation native captures and failed admission.** The exact4.5 profile records604PASS/81FAIL/13BLOCKED, then607PASS/78FAIL/13BLOCKED. Both repetitions map the original99 failures to98PASS and one signed-satoshi `listActions` FAIL. Seven outcomes differ. The independent parent first rejects five worker destinations absent from the frozen plan; no native/integrated qualification or Rust result was produced. [The complete original attempt](../journals/integrated-native-attempts/2026-11-12/43292183851/README.md) remains unchanged.

The original5.1.0 baseline remains280 observations,180PASS/99FAIL/oneBLOCKED. Two improvements are explicitly versioned namespace-oracle corrections. Counts across changed wallet/component/fixture versions do not identify individual causal wallet fixes. Complete BRC100 coverage remains blocked by recorded capability and interpretation requirements.

The optional [4.6 profile](../itcves/ITCVE-1/4.6.0/README.md) binds the exact [e360e67 wallet candidate](../fixtures/artifacts/yours-wallet-pr368-e360e67/README.md), append-only producer receipts and extension oracle3. All698 predicate identities remain present. Its source and prospective fixes are separately frozen; fresh native qualification is required.

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
| 9: [43268040660](https://github.com/p2ppsr/interop/actions/runs/43268040660), candidate `3e8a97f`, source `664e853`; [archive](../journals/integrated-native-attempts/2026-11-12/43268040660/README.md) | No completed native capture or original-99 comparison is available; execution after communication loss is unknown. | Hosted runner lost communication. Last reported active step was image export; terminal steps remain pending. No artifact or cleanup receipt is available, job logs return 404, and workflow logs are empty. No qualification or Rust result can be admitted. | 3,784 |
| 10: [43285086155](https://github.com/p2ppsr/interop/actions/runs/43285086155), candidate `3e8a97f`, source `dad2a6e`; [archive](../journals/integrated-native-attempts/2026-11-12/43285086155/README.md) | Zero native sessions or observations; original-99 comparison not executed. | Final image export completed in 5.9 seconds. The image audit rejected an out-of-scope expected `/opt` parent; wallet execution was skipped. Both complete Linux inventories and original logs are retained. No native qualification or Rust result exists. | 877 |

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

Source3 [Foundation43281286382](https://github.com/p2ppsr/interop/actions/runs/43281286382)
failed one offline unit test: it expected a prebuilt Go binary in that job.
The operator canceled the other jobs after the failure; total CI use was210
job-seconds, bringing this cohort to33424. Original APIs and all available job
logs are retained in the [CI failure archive](../journals/native-closure-ci/2026-11-12/718da3b/README.md).
The prospective source4 binding retains the source3 plan and fixes only the
unit fixture dependency and explicit source selection. The test uses owned,
inert fixture bytes and removes them afterward. The production Linux audit
still requires the actual compiled storage binary and manifest. Its217core
tests and type/catalog checks pass; Linux execution remains required.


## Staged-image Linux result

[Attempt10](https://github.com/p2ppsr/interop/actions/runs/43285086155) completed
the two-layer image export in **5.9seconds**, then its filesystem audit rejected
an extra expected `/opt` parent entry outside the collector's `/work` and
`/opt/tpnil` roots. Both full Linux inventories were retained:70985base entries
and71431final entries. Wallet execution was skipped and no native result was
produced. The original failed audit remains FAIL.

A separately labelled engineering replay reconstructs the exact Linux build
manifest from original CI output, binds the dynamic binary hash and manifest
hash, and checks every retained entry after the exact scope correction. It
passes and rejects a seeded deletion. This is packaging evidence, not native
qualification. The prospective source5 audit aligns the collector/overlay
roots, retains image/configuration/overlay diagnostics before comparisons, and
bounds error output. All698native criteria remain unchanged.

The preceding [source4 Foundation](https://github.com/p2ppsr/interop/actions/runs/43282017592)
passed:216core PASS/1SKIP,1675synthesis PASS/120SKIP,Python5,Go13; integrated
observations584PASS/six retained upstream Go Messaging FAIL. Its three original
ZIPs/262members and complete logs are retained. CI1677seconds plus native877
seconds bring completed cohort use to**35978job-seconds**. All full monetary
and effort costs remain unknown.

The [source5 Foundation run](https://github.com/p2ppsr/interop/actions/runs/43289524357)
passed on exact source `784733b9cfdb1e29f0e4922d6ca90e768144bfee`:
216 core PASS / one SKIP, 1675 synthesis PASS / 120 SKIP, five Python passes
and 13 Go matrix passes. Its integrated report retains 584 PASS and six
upstream Go Messaging FAIL findings; evidence verification passed. The
[CI archive](../journals/native-closure-ci/2026-11-12/784733b/README.md) retains
all three original ZIPs, 262 members and complete logs. Its 1562 job-seconds
bring completed cohort use to **37540 job-seconds before native attempt 11**.


## Attempt11 diagnosis and prospective4.6 correction

The source5 Linux audit passes71433 filesystem entries, complete inherited runtime configuration and two added image layers. Both native containers exited0, were removed and host namespace policy was restored. Native job2609seconds plus Foundation1562 closes that order at4171seconds and completed cohort40149. Full monetary and effort costs remain unknown.

The failed attempt exposed an aggregate submission-order defect: provider concatenation inserted later root receipts before previously observed counterpart positions. The4.6 owned producer journal synchronously records every event, preserves provider-local arrays and exact provenance, and verifies all prefixes through shutdown. Original policy1/2 and failed histories remain unchanged. This correction retains every receipt; it does not waive application-payment, ancestor or denied-spend checks.

Native UI capture now waits for the target control and a settled screen before recording its pre-click body. Exact trusted click/body equality remains mandatory. Active-provider observation compares rendered badge case and durable provider state rather than requiring a transient success snackbar. The permission observer separately binds generated single-protocol requests and the complete fetched manifest. Linkage scope explicitly includes the revealed peer and verifier.

Extension oracle3 corrects one normative error: the pinned contract permits literal `identityKey:true` or omission, so `false` must reject. Ordinary child derivation and true identity retrieval remain independent controls. The prior oracle2 acceptance and every old result remain immutable.

Wallet candidatee360e67 adds per-origin action creation serialization while preserving all other pending debits, complete peer-scoped linkage grants, bounded protocol indexes and discovery's omitted consent defaultfalse. Positive trust setup requests consent explicitly; fresh-origin default-denial tests retain their original requests. [CI43306868169](https://github.com/yours-org/yours-wallet/actions/runs/43306868169) passes269tests/1839expectations and all4 bundles in103job-seconds. Intake verifies352files,45 inner members, patch postimages, source attribution and139 package-version license records. Completed cohort40252; costs remain unknown.

The separate source8 retained-evidence reevaluation preserves the exact original186-member archive and280native/77integrated/48Rust criteria. It allocates no native session. New profile execution and full independent replay remain required before publication of a qualification.


## Source113e235 prerequisites and canceled native12

[Foundation43310303924](https://github.com/p2ppsr/interop/actions/runs/43310303924) passes at exact source113e235:224core PASS/one SKIP,1686synthesis PASS/122SKIP, five Python and13Go checks. The integrated component report retains584PASS and six upstream Go Messaging FAIL findings; its evidence verification passes. The original artifact ZIPs contain262members and are retained in [CI archive](../journals/native-closure-ci/2026-11-12/113e235/manifest.json). It used1818job-seconds.

[Retained reevaluation43310303966](https://github.com/p2ppsr/interop/actions/runs/43310303966) passes under source8 after144job-seconds. It retains the original186-member native archive,280native observations per repetition (180PASS/99FAIL/one BLOCKED),77integrated and48Rust3 PASS per repetition. A separate frozen-source, dependency-guarded replay passes with a fresh Rust target and leaves all220artifact members unchanged. [Reevaluation provenance](../journals/native-integrated-reevaluation/2026-11-12/43310303966/provenance.json) retains its exact source, byte and execution boundary.

[Native attempt12,43313189229](https://github.com/p2ppsr/interop/actions/runs/43313189229) was canceled during image build after offline retained-trace diagnosis confirmed an additional oracle defect. Pinned Go storage intentionally broadcasts a newly stored unmined import. Source and replacement providers each retain the identical external fixture receipt in attempt11; zero receipts cannot establish valid import behavior on replacement storage. Both native execution steps were skipped. No new wallet session or qualification was produced. [Canceled attempt](../journals/integrated-native-attempts/2026-11-12/43313189229/attempt.json) retains terminal APIs, all logs and the original diagnosis. It used654job-seconds; order13 closes at2616, and completed cohort use is42868. Full monetary and effort costs remain unknown.

Optional [ITCVE-1 4.7 / ISI-4 5.7](../itcves/ITCVE-1/4.7.0/README.md) prospectively adds basket policy2 and extension oracle4. A successful declared external-fixture import may emit at most one exact prior raw transaction receipt, with independently verified signed AtomicBEEF/mined proof and earlier accepted creation window. All receipts remain in the append-only global/provider ledgers. Rejected calls still require zero receipts and unchanged complete owned state; funding, protected outpoints and final ancestry checks remain mandatory. The actual two-provider Go causal check passes, and seeded mutations reject altered/new/extra transactions, missing acceptance, wrong windows, repeated receipts and invalid calls. These offline controls do not readmit earlier failures or establish native qualification.


## Publication-index correction and unchanged criteria

At source39fc1d4, [Foundation43318146814](https://github.com/p2ppsr/interop/actions/runs/43318146814) was canceled after local verification found that native12 used a cancellation-specific claim outside the existing publication vocabulary. The original manifest is retained byte-for-byte in [original-attempt-cancellation-v1.json](../journals/integrated-native-attempts/2026-11-12/43313189229/original-attempt-cancellation-v1.json). The publication index appends a correction and uses the existing observer-verification-error classification. Run/source, skipped steps, raw files, costs and qualification remain unchanged. All416 frozen native inputs and all five evaluator inputs remain exact; the [machine impact record](../journals/native-closure-diagnostics/2026-11-12/source7-publication-recovery/impact.json) binds them. The complete physical integration-archive verifier passes after correction.

[The canceled Foundation archive](../journals/native-closure-ci/2026-11-12/39fc1d4-canceled/manifest.json) preserves all APIs, logs and its18-member Go artifact. Go passes after314seconds; offline347 and integrated363seconds were canceled. No native13 was dispatched. [Source9 reevaluation43318146899](https://github.com/p2ppsr/interop/actions/runs/43318146899) passes after158seconds. Its [original artifacts and independent replay](../journals/native-integrated-reevaluation/2026-11-12/43318146899/provenance.json) preserve all220members, original186-member native archive and280/77/48 criteria. No new native session is created.

Order14 closes at1182job-seconds, bringing completed cohort use to44050. A separate bounded recovery order can carry forward this unchanged evaluator proof, rerun Foundation and perform the still-unexecuted native13. Full monetary and effort costs remain unknown.


## Unexecuted profile metadata source successor

Draft [PR26](https://github.com/p2ppsr/interop/pull/26) retains the complete implementation while final native admission is pending. [PR Foundation43321667855](https://github.com/p2ppsr/interop/actions/runs/43321667855) was canceled after1460job-seconds when a final metadata audit found a stale redundant oracle3 label in the4.7 profile pointing to the correct oracle4 manifest. The plan, top-level profile and actual runtime already selected4. No native13 ran. The full branch journal-history check against accepted main passes; the earlier push-only history failure remains retained, and the gate is unchanged. The PR's synthetic checkout tree equals source58 exactly. Its offline checkout separately stalled fetching full history and a raw synthetic merge SHA; the exact logs are retained.

The [418-input source successor](../infra/native/conformance/plan-pr368-coverage-5-source-2.json) corrects this label before the first native4.7 run. The [original unexecuted profile](../itcves/ITCVE-1/4.7.0/profile-source-1.json), original plan and both previous CI samples remain byte-identical. Every actual predicate, artifact and698 identity stays unchanged. Metadata-to-policy consistency checks cover all declared coverage modules and previous completion profiles. CI retains full history and exact event-SHA checks while separating ordinary-history and named-merge fetches over HTTP/1.1, with bounded offline-job headroom. [Local source preflight](../journals/native-closure-diagnostics/2026-11-12/source8-preflight/manifest.json) passes231core and1744synthesis tests, typecheck/catalog/standards, five Python checks and all focused source selectors. Original failed samples are preserved.

[Source58 push history failure](../journals/native-closure-ci/2026-11-12/58e0c45-push-history-failure/manifest.json) and [canceled PR metadata attempt](../journals/native-closure-ci/2026-11-12/58e0c45-pr-metadata-canceled/manifest.json) retain all APIs, logs and artifacts. Order16 closes at1460job-seconds, bringing completed cohort use to46764. Source9 evaluator inputs/plan remain unchanged and its separately accepted frozen replay carries forward; it establishes no native4.7 qualification. Full costs remain unknown.


## Native13: retained failure and versioned4.8 recovery

[Native43330313975](https://github.com/p2ppsr/interop/actions/runs/43330313975) at sourceb83489c completes both698-observation captures:645PASS/40FAIL/13BLOCKED and622PASS/40FAIL/36BLOCKED. Both original99 projections are98PASS/one signed-satoshi FAIL;23 outcomes differ. Native admission fails before any qualification or Rust result is produced. The [failed-attempt archive](../journals/integrated-native-attempts/2026-11-12/43330313975/attempt.json) retains the original535-member ZIP, all terminal APIs/logs, image audit and unchanged raw verdicts. No full semantic replay or native qualification is asserted.

[Foundation43327879506](https://github.com/p2ppsr/interop/actions/runs/43327879506) passes all three jobs in1618job-seconds:230core PASS/one SKIP,1712synthesis PASS/123SKIP, five Python and13Go checks. The integrated matrix preserves584PASS/six upstream Go Messaging FAIL findings with passing evidence verification. [Exact CI artifacts](../journals/native-closure-ci/2026-11-12/b83489c/manifest.json) retain262 members. The canceled duplicate push uses25seconds. Native13 uses3170seconds; order18 closes4813seconds, completed cohort53270. Full monetary, operator, agent and allocated-capacity costs remain unknown.

The separately frozen [ITCVE-1 4.8](../itcves/ITCVE-1/4.8.0/README.md) and [ISI-4 5.8](../programs/ISI-4/5.8.0/README.md) retain the exact e360 wallet, Go10 pins and698 observation identities. They correct four observer contracts before fresh execution:

- The complete nine-context chain is validated before projecting the older permission anchor's exact five-context prefix. Completion independently verifies the later contexts.
- Basket policy3 checks declared public plaintext through four listOutputs basket queries before mutation and after the public CWI handle refresh. Full owned snapshots retain encrypted metadata and every original native fixture cipher byte. Relinquished outputs have no public basket membership; their private bytes remain exact. No browser restart is claimed by this handle refresh.
- Transaction oracle4 admits complete Node-owned proof graphs below depth128 and2048 retained transactions. The same sole mined root, every ancestor body, signature, input and cycle check remain mandatory. Legacy Node admission remains32; independently frozen Rust3 remains64. The [append-only correction](../journals/native-closure-diagnostics/2026-11-12/native13-ancestry-cap-correction/README.md) corrects the failed archive's initial human64 label to the actual32 cap. Original errors and verdicts are unchanged.
- The transaction-branch observer reads the pinned wallet's unique Active Storage summary and exact remote-provider detail, independently bound to provider identities, PNG hashes and observation windows. Backup-row buttons do not carry the active summary.

Local diagnosis against both original captures validates all29 permission predicates and derives21 transaction PASS/one interpretation BLOCKED under the prospective oracle. It changes no original file and cannot qualify the unexecuted4.8 native profile. Actual Go storage and public permission-manager metadata checks and a real Chromium DOM observer check pass as LAB_SELF_TEST_ONLY. Fresh native qualification, both actual Rust results and independent frozen-source replay remain required. The signed-satoshi and broader BRC100 interpretation/coverage gaps remain explicit.

## Native14 closeout and transitive source successor

[Native14](https://github.com/p2ppsr/interop/actions/runs/43346773141) retains two matching698-observation captures, each676PASS/3FAIL/19BLOCKED. Both original99 projections remain98PASS/one signed-satoshi FAIL. Parent admission fails before native/integrated qualification or Rust; full semantic replay is refused. The [536-member original archive and terminal evidence](../journals/integrated-native-attempts/2026-11-13/43346773141/README.md) preserve the exact115,002,820-byte ZIP at SHA256`bd7c7ea083220e21fbe2876fe8856fa416e2a6c701edb3e8a9db4774ec68efaa`. Independent image reconstruction verifies all71,492 final entries,520 source-overlay entries and complete runtime configuration.

[Foundation43344671229](https://github.com/p2ppsr/interop/actions/runs/43344671229) passes in1,657job-seconds; its integrated matrix preserves584PASS/six upstream Go Messaging FAIL findings. The canceled duplicate uses109seconds and evaluator10 reevaluation132. Native14 uses3,156seconds, closing order19 at5,054 and the completed cohort at58,324. Monetary, operator, agent and allocated-capacity costs remain unknown.

The [source-only successor](native-observer-source-correction-2026-11-13.md) retains the original4.8 profile/policy/plan bytes and698 IDs. It corrects transitive permission-prefix, transaction-oracle and basket-metadata bindings, exact fixture replay, the controlled foreign-owner fixture join and the Active Storage header Edit/Sync Now observer. Local preflight passes236core tests,1,800synthesis tests/92SKIP, five Python tests, typecheck/catalog/standards,197focused controls,74transaction-parent controls and29basket-parent/metadata controls. One earlier local synthesis cleanup hook timed out; its failed log remains retained and the complete subsequent suite passes.

Both unchanged native14 captures pass prospective shutdown, transaction/extension, funding, final-submission and completion-parent diagnosis. Partial traces each derive61SCOPED_PASS/zeroFAIL/twoBLOCKED. This diagnosis is not a new native qualification. Original native15 receipts, both Rust results, matching captures and independent frozen replay remain required before PR readiness.


## Native15 closeout and transaction fixture correction

[Native15](https://github.com/p2ppsr/interop/actions/runs/43358474345) retains two
matching698-observation captures, each678PASS/oneFAIL/19BLOCKED. The original99
remain98PASS/one signed-satoshi FAIL. The [exact546-member archive](../journals/integrated-native-attempts/2026-11-13/43358474345/README.md)
preserves the failed parent admission and absence of original qualification or
Rust results. Full semantic replay is correctly refused. Independent image
reconstruction verifies all71496 final entries,524 source-overlay entries and
two added layers. The original ZIP is138196978bytes at SHA256
`fed4697fd4c6b91c37e6e1d55e15808ad027b376d0fc8bb49c1cafb32ccd4d63`.

[Foundation43356669995](https://github.com/p2ppsr/interop/actions/runs/43356669995)
passes1511job-seconds; its matrix preserves584PASS/six upstream Go Messaging FAIL
findings. The canceled duplicate uses27seconds. [Evaluator10 reevaluation43356872719](https://github.com/p2ppsr/interop/actions/runs/43356872719)
passes155seconds and independent frozen replay, preserving all original criteria
and bytes. Native15 uses3294seconds: order20 actual4987, completed cohort63311.
Full monetary/operator/agent/capacity costs remain unknown.

The [source3 correction](native-transaction-fixture-source-correction-2026-11-13.md)
separates the stale unsigned-TXID fixture from a full-set child that may legally
have no change. It reuses an independently staged change-bearing transaction,
retains strict source/intent/proof/window/batch checks, and persists fatal
evaluator diagnostics. The original4.8 criteria and source2 JSON remain frozen.
The [offline preflight](../journals/native-closure-diagnostics/2026-11-13/native15-transaction-fixture-preflight/manifest.json)
passes236core tests,1806synthesis/92SKIP,62focused transaction controls, types,
catalogs, standards and fivePython checks. Both original native15 no-change
counterexamples and an injected staging failure are retained as engineering
controls. Fresh native qualification, both actual Rust results and complete
independent replay remain required before PR readiness. Full BRC100 conformance
and the signed-satoshi finding remain open.


## Source3 admission stop and signed-control classification

[Source38d Foundation43367727544](https://github.com/p2ppsr/interop/actions/runs/43367727544)
passes2074job-seconds:235Linux core/oneSKIP,1773synthesis/125SKIP, fivePython and
13Go checks;262artifact members are retained. The component matrix remains
584PASS/six upstream Go Messaging FAIL findings. Duplicate43367712049 is canceled
at49seconds. [Evaluator10 run43367814553](https://github.com/p2ppsr/interop/actions/runs/43367814553)
passes152seconds and independent frozen replay with original bytes and criteria
unchanged. Order21 actual2275 and completed cohort65586.

No native16 session was dispatched. Review found that the broad fixture-blocker
handling could classify an attempted valid signed-control error as BLOCKED.
The [admission stop and exact old/new replay](../journals/native-closure-diagnostics/2026-11-13/native-signed-control-classification/manifest.json)
are retained. The [source4 correction](native-transaction-failure-classification-2026-11-13.md)
permits BLOCKED only before either request was attempted and before any fixture
mapping exists. An observed error from the valid signed control remains FAIL.
Its failed diagnostic report is preserved; global evidence errors remain fatal.

Local236core,1807synthesis/92SKIP,63focused, eightselector/image and fivePython
checks pass with types/catalogs/standards. The original4.8 criteria,698IDs,
wallet, Go10, Rust3 and source3 JSON remain frozen. Fresh original native
qualification, both actual Rust results, independent frozen replay and final
publication checks remain required. Full BRC100 conformance stays unproven.


## Native16 evidence failure and source5 composition

[Sourcef4bc Foundation43370667487](https://github.com/p2ppsr/interop/actions/runs/43370667487)
passes1825job-seconds:235Linux core/oneSKIP,1774synthesis/125SKIP, fivePython and
13Go checks. Its590-observation component matrix retains584PASS/six upstream Go
Messaging FAIL findings with verified evidence. Duplicate43370653169 is canceled
at50seconds. [Evaluator10 run43370755592](https://github.com/p2ppsr/interop/actions/runs/43370755592)
passes137seconds with independent frozen replay and original bytes unchanged.

[Native16 run43372408766](https://github.com/p2ppsr/interop/actions/runs/43372408766)
fails after3341job-seconds. The raw captures contain684PASS/twoFAIL/12BLOCKED
and683PASS/threeFAIL/12BLOCKED. Both original99 remain98PASS/one signed-satoshi
FAIL. Final replay rejects a producer permission PASS after the later completion
sequence overwrites its identity PNG. The original early image is missing; no
original qualification or Rust results exist. Full replay is refused. The
[failed attempt](../journals/integrated-native-attempts/2026-11-13/43372408766/attempt.json)
preserves the exact141401919-byte ZIP and548member hashes. Independent image
reconstruction verifies71521final entries,549source-overlay entries, all451
frozen inputs, full runtime configuration and the original Linux Go manifest.
Both containers exit0 and are removed; host policy is restored. Order22 closes
at5353job-seconds, completed cohort70939. Full costs remain unknown.

The [source5 correction](native-evidence-ownership-source-correction-2026-11-13.md)
is limited to evidence composition. Completion prompt PNGs have their own
parent-selected namespace, and captured image bytes are immutable. Valid imports
may replay only an exact previously accepted fixture. A rejected reference may
overlap only an exact earlier signed delayed-wallet raw receipt. Later spending
of native-owned change and an already credited payment requires the complete
transaction-branch parent, independently proven funding, owned inventory and
its exact declared held-transaction release. Every other final protected spend
remains rejected. All698criteria and earlier frozen source JSON remain unchanged.

Retrospective diagnostics execute16independent parent/funding checks per capture
with these prospective corrections. The missing early PNG and absent new
namespace remain rejected; original results are unchanged. Fresh original
qualification, both actual Rust results and complete frozen replay are still
required before readiness. Full BRC100 conformance remains unproven.
