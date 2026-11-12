# Changelog

## Unreleased

- Add ISI-5 0.1.0, multicast transaction and object delivery, with twelve draft vectors, and its environment ITCVE-2 0.1.0. Retain twenty component qualifications: fourteen for the multicast harness, one for the BRC-22 submit boundary, four for the portable joined configuration (V008 to V011 with its ready and restore conditions), and one for the delivery edge's repair. Add the Teranode regtest profile TPNIL-TERANODE-REGTEST-2 (Teranode v0.16.0) for the joined configuration. The joined runs observe byte identity on the transaction, subtree and block lanes, and V010 runs on shard-listener v1.36.1. Register both in the program index, schemas and repository check.
- Add ITCVE-1 1.1.0 with independent TypeScript/Go Overlay, ChainTracks and Wallet Storage selection, pinned native dependencies, authenticated mixed-component tests, fault/recovery checks, wallet/Android configuration and CI evidence. Historical profiles and results remain fixed.

## Unreleased

- Simplified the roadmap, security reporting and submission guidance; aligned current wallet summaries with retained evidence and removed obsolete governance requirements.

- Broadened public submission permissions to non-commercial TPNIL-related activity, including education, research, reproduction and preservation, with resale and unrelated commercial exploitation excluded.

- Established lasting public reproduction and mirroring rights for accepted submissions.
- Added a separate public reproduction authorization finding to intake reports.

- Licensed original project materials under Apache-2.0, with explicit third-party exceptions.
- Simplified governance and contribution rules; retained focused vendor submission permissions.
- Separated technical intake readiness, evaluation authorization, hosting rights and participation announcements.


## 0.5.0 — multi-wallet BRC-100 execution (2026-09-20)

- Retained a deterministic compiled `todo-ts` web-root artifact and enabled ISI-4 V001 through V006 for drivers that implement the required observations.
- Added the Yours Wallet 5.1.0 Chromium driver, isolated controlled services, mainnet-format funding fixture, transaction and PushDrop oracles, permission observations, broadcast schedules, and full eight-vector reporting.
- Retained two clean Yours Wallet repetitions with the same semantic projection: V001–V004 pass, V005–V006 fail, and V007–V008 are blocked.
- Added exact-AAB Metanet Explorer 1.1.10 qualification, deterministic bundletool conversion, a public Android fixture signing key, native UI and WebView probes, and a retained phone-verification blocker.
- Added a source-pinned BSV Browser 1.6.1 engineering build and observation. Ordinary wallet creation produced an authenticated mainnet 28-method BRC-100 context; the live ToDo flow reached the expected 25-satoshi funding boundary. The build remains outside production admission because no publisher binary was available.
- Added offline-verifiable native-observation and wallet-run evidence formats, journal verification, tamper tests, and append-only retained evidence.
- Added local Android AVD tooling and a repository-scoped KVM GitHub Actions lane backed by a non-root, tokenless, digest-pinned Evans Creek runner.
- Added manually dispatched Android qualification and Yours Wallet execution workflows whose plans, artifacts, and semantic verification remain repository-owned.
- Adopted ISI-4 decision 0005 to define multi-wallet execution, preserve failed and blocked results, and separate engineering candidates from admitted artifacts.

## 0.4.0 — executable transaction-processing synthesis (2026-09-20)

- Added the hosted macOS native qualification lane, observed-state Electron driver, signed artifact admission checks, and two retained BSV Desktop 2.8.5 runs.
- Added content-addressed native evidence bundles with offline recomputation and tamper tests.
- Recorded the hosted qualification and pinned local reconstruction strategy in ISI-4 decision 0004.
- Adopted the layered ISI-1 transaction-processing synthesis: current BRC-35 Global KVStore records, UHRP, CHIRP, LCH, overlay convergence, Teranode/Arcade/Merkle processing, independent oracles, and the TPNIL Synthesis Board.
- Recorded current implementation pins and exploratory passing CHIRP, LCH, and LCH reference-application suites without treating upstream tests as TPNIL conformance evidence.
- Imported digest-pinned BRC-167 and BRC-170 vector corpora and added dependency-free laboratory self-tests for CHIRP identifiers, LCH framing, segmented authenticated decryption, range reconstruction, and tamper rejection.
- Added the executable Synthesis Board reference profile with BRC-100-derived PushDrop records, revision spends, overlay HTTP synchronization, CHIRP host failover, LCH acquisition, replay, and negative cases.
- Added a digest-pinned Teranode regtest profile and retained qualifications for deterministic funding, real board-record transactions, conflict rejection, token revision, mining, retrieval, and restart recovery.
- Added source-pinned Arcade component qualification with declared laboratory adapters, a real Merkle Service image, embedded ChainTracks, retained inputs, and offline-verifiable output evidence.
- Proved the joined Arcade-to-Teranode-to-Merkle path first with a controlled payment and then with revision 3 of the actual Synthesis Board PushDrop token. Teranode accepted and mined the transactions, Merkle Service acquired the exact native block and subtree data, and each returned proof reproduced the real block-header root.
- Added canonical signed UHRP advertisement tokens, `tm_uhrp` submission, `ls_uhrp` HTTP lookup, expiry, revocation, replay, and content-host failover to the reference profile, with a dedicated content-addressed reference qualification journal.
- Extended the joined on-chain path through the canonical UHRP advertisement and a receipt-complete two-payee BRC-170 LCH settlement, with each transaction accepted by Arcade, mined by pinned Teranode, and independently verified through Merkle Service against the native block header.
- Added a one-command clean-stack orchestrator, recursive aggregate verifier, and two clean retained joined-stack qualifications that bind transaction ancestry, fixture digests, generated plans, runtime evidence, and component evidence.
- Added retained ChainTracks reorganization evidence and missed-callback `/reprocess` recovery for ten watched transactions against immutable Merkle Service v0.6.0, including an explicit compatibility adapter for the historical coinbase-placeholder fixture.

## 0.3.0 — portable laboratory execution (2026-09-20)

- Adopted the hybrid execution architecture: one repository-owned protocol for local, independently operated, and CI-scheduled laboratories; portable controlled services; disposable native guests; and offline-verifiable evidence bundles.
- Added the `run-qualification` and `verify-qualification` commands, a safe canonical web-root extractor, a logical-origin HTTP test stand, raw response retention, and content-addressed application/evidence closure.
- Added the first executable infrastructure plan for the canonical `todo-ts` web-root artifact. Its result is expressly limited to infrastructure qualification and cannot issue a SUT conformance finding.
- Selected a pinned Tart/Apple Virtualization lane for disposable macOS arm64 guests. Native runner qualification and ISI-4 wallet execution remain separate recorded gates.

## 0.2.0 — production-fidelity intake (2026-09-18)

- Adopted ISI-4 decision 0001, ISI-4 1.0.0, and ITCVE-1 1.0.0: unchanged mainnet wallet artifacts with explicitly configured controlled services, replacing mandatory wallet regtest support.
- Added qualitative intake records, artifact/evidence validation, and the `review-intake` command.
- Added independent current-program selection while retaining prior definitions and the 0.1.0 self-test/evidence protocol.
- Applied intake to BSV Desktop 2.8.5: downloaded and digest-verified the macOS arm64 DMG, verified static signature integrity, and recorded release-tagged configuration findings. Runtime admission and ToDo execution remain blocked.

## 0.1.0 — foundation (2026-09-17 UTC)

- Established TPNIL charter and founding governance, equal participation, evidence, and determinism policies.
- Assigned ISI-1 to integrated stack testing; ISI-2 overlays; ISI-3 remote storage; ISI-4 wallet/application BRC-100.
- Defined ITCVE-1, adapter lifecycle, candidate admission, normative vector catalog, and staged qualification gates.
- Added an offline core, synthetic self-test, evidence replay, artifact verification, and append-only journal validation.
- Pinned public research sources and BSV Desktop v2.8.3 release metadata. Verified the macOS arm64 DMG digest and produced matching todo-ts compiled web-root artifacts from two local builds. Artifact admission remains pending.
