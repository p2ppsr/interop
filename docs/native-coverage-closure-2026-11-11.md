# Native coverage closure proposal — November 11, 2026

Status: **design inventory; no new native execution or qualification**. The
[machine-readable inventory](../programs/ISI-4/proposals/native-coverage-closure-20261111.json)
expands the five retained coverage obligations into 36 case groups and 306
variant rows. These are planning units, not an adopted assertion denominator.
All cases are `NOT_EXECUTED`; all five obligations remain `OPEN`. The original
280-predicate native projection, 233-predicate clause corpus and failed/blocked
observations retain their identities.

The inventory identifies methods, pinned clauses, fixtures, independent oracles,
negative controls, implementation dependencies and prospective interpretations.
Every one of the 28 methods has an accountability entry that distinguishes its
existing method baseline from proposed conditional coverage. This is a complete
work inventory for the five named obligations; it is not a claim that all
requirements in BRC-100 or its referenced standards have been exhaustively
formalized. Driver and oracle review may split a planning variant into multiple
assertions before the new profile is frozen.

## Released artifact observations

The static review reads source contents embedded in the exact publisher ZIPs,
without changing or executing them. The inventory binds each selected source
map member and embedded source digest.

| Artifact | ZIP SHA-256 | Bytes | Reviewed supported boundary |
| --- | --- | ---: | --- |
| Yours 5.1.0 | `d55abda7dc8790ecfdd57ed0f5f4dd4a28187bb4833715f7612b067625eabc52` | 13,513,123 | Public CWI and visible native permission/settings controls |
| Yours 5.1.1 | `454c8581b8d6ab120c9b2f2f74167f536b08e720bc12e75f3e9437d14a985878` | 13,644,482 | Same reviewed feature boundaries; requires a separately admitted execution |

In both releases, `@1sat/wallet/dist/factory.js` creates the active Wallet with
chain, key deriver, storage and services, without `privilegedKeyManager`.
`src/initWallet.ts` supplies no secondary-key configuration. Bundled generic
privileged-key classes do not establish an active privileged configuration.
USB-based unlock or presence checks concern the existing wallet keys and do not
establish a distinct privileged keyring.

The single, grouped and counterparty permission UI components have identical
source hashes across the two reviewed releases. They send grant selections
without an expiry value. The background can receive an internal expiry field,
but no supported user control was identified. Direct extension messaging,
private permission-store edits and clock injection cannot create native expiry
evidence for this profile.

Both releases install `createEventCWI()` through `src/cwi.ts` and forward
object-valued requests from `src/content.ts` to the background with the actual
page host. No publisher-native Wallet Wire processor/listener was identified.
Bundled SDK client encoders and a laboratory adapter forwarding to CWI establish
neither a native byte endpoint nor its authorization boundary.

## Work ownership and native fixtures

| Obligation | Implementable lab work | Remaining artifact or interpretation dependency |
| --- | --- | --- |
| Privileged secondary keyring | Public request/reason cases and independent normal/privileged crypto comparisons once admitted | Released supported secondary-root setup, user presence, cache/lock lifecycle; an unsupported feature cannot be counted as a full-conformance pass |
| Permission scope/lifecycle | Both linkage methods; deny/allow/cache/verifier/origin isolation; lock/restart persistence and revocation; selected BRC-73 grants and cumulative monthly allowance | Supported finite-expiry control for the finite-expiry configuration; explicit lifecycle interpretation and a real calendar-boundary run for monthly reset |
| Native byte wire | Raw frame, all-28-code, malformed/error and public-state/permission parity corpus | Publisher-native endpoint and transport admission, or an explicitly narrower scope that leaves complete BRC-100 coverage false |
| Basket limit | Public create/insert/query/reload/remove at ASCII 0/4/5/299/300/301/399/400/401 bytes; separate Unicode and namespace probes | Prospective versioned resolution of the pinned 300-versus-400 contradiction |
| Conditional branches | Defaults, signing/reference conflicts, batching/proof trust, query/include/pagination, actual certificate issuance, keyrings, discovery and revocation | Authenticated certifier fixture, real revocation UTXO, clause-specific interpretations and independent native execution |

The new manifest fixture belongs at a separately declared controlled HTTPS
origin. `metanet.groupPermissions` supports selected protocol, basket,
certificate and spending grants through the real grouped prompt. This does not
require modification of the canonical compiled ToDo artifact. Existing
alternate/deny service routes currently return fixture HTML for all paths;
they do not already serve a valid manifest.

Restart coverage requires a runner hook that relaunches the same isolated
profile and uses normal unlock UI. The present scenario context exposes no
relaunch operation. Preserve the native identity, admitted artifact, browser
sandbox, CA trust, network isolation and complete provider submission ledger
across the restart. An intermediate browser close is distinct from the final
shutdown receipt. No permission database inspection is needed: public CWI,
visible settings, prompt decisions and resulting independent operations are
the evidence.

Standing allowance cases must bind actual cumulative spending and fees, not
just each payment's face amount. Capture partial grant selection, the exact
cap, a second payment exceeding the cumulative cap, denial with no late
submission, revocation and alternate-origin isolation. Aborted, rejected,
held and concurrent actions need a frozen accounting policy. A mocked clock
cannot establish a native calendar-month transition.

The released wallet implements the public `acquisitionProtocol: "issuance"`
path. A controlled authenticated `/signCertificate` service can exercise it
without changing the wallet. Its fixture must implement client/server nonces,
serial-number HMAC, authenticated certifier identity, encryption and signature
checks. Direct acquisition alone does not cover that protocol. Revocation
requires an actual ancestry-verified controlled UTXO and spend; the existing
zero-hash placeholder used for other certificate tests cannot prove revocation.

## Prospective interpretation decisions

All decisions below are **drafts, not adopted oracle behavior**. The inventory
includes exact pinned source line references. Its standards pin is BRCs
`39a643ff148a8dcd23ec08986a8ddeb7d5713743`, the same BRC-100 source as the retained
clause contract. Referenced BRC-69/72/73/116 material informs this proposal;
including it here does not expand an existing scored standard set.

1. **Privileged scope:** BRC-100 line 42 describes a secondary keyring while
   line 324 says “When implemented.” Preserve that tension explicitly. A
   nonprivileged CWI profile can describe its narrower evaluated scope, but
   cannot convert absent privileged coverage into complete BRC-100 conformance.
   Wrong-type field tests remain applicable and original results remain fixed.
2. **Permission lifecycle:** BRC-100 line 80 discusses expiration. BRC-116
   lines 493 and 855–862 describe finite expiry as an optional, explicit policy;
   spending grants instead use expiry zero and calendar-month budgets. Separate
   those claims. BRC-116 also requires authoritative on-chain state at lines
   459–462 but describes on-chain persistence as optional at lines 797–799.
   Yours uses local permission storage. Native local-grant evidence cannot
   silently become full BRC-116 conformance under that unresolved wording.
3. **Wire scope:** BRC-100's ABI section at line 1524 specifies Wallet Wire
   framing. A CWI-only result must retain that exclusion and full-coverage
   false. Native wire claims require an admitted native endpoint and all its
   state/authorization evidence.
4. **Basket limit:** Propose a new oracle using the typed maximum of 300
   inclusive from lines 518–524, with the strict namespace rules from lines
   351–365. The prose maximum of 400 remains the documented conflict. Valid
   ASCII names have equal byte/character counts. Unicode probes at the same
   byte boundaries are invalid namespace probes, so their rejection does not
   resolve the ASCII length conflict. No lowercasing or trimming by the lab
   repairs a returned/input SUT value.
5. **Broadcast timing:** Lines 655/724 define delayed=true as background and
   false as synchronous, while sendWith lines 661/727 invert that description.
   Propose applying the direct option definition consistently, while retaining
   separate synchronous rejection, eventual delayed submission and complete
   shutdown-ledger checks. Adoption precedes execution.
6. **Conditional fields and revocation:** Publish branch-specific rules for
   missing, conflicting or inactive values. Simultaneous optional fields are
   not automatically conflicts. Separate signature validity, spent revocation
   state, discovery acceptance and local relinquishment; identify which method
   is required to reject before scoring that rejection.

Governance requires the recorded maintainer decision and an acceptance-changing
major version before any scored run uses these rules. New artifact results
remain separate from unchanged 5.1.0 findings. Historical verifier replay and
all failed attempts remain available. No dependency can be satisfied by marking
the associated branch `N/A` and then asserting full BRC-100 conformance.

## Execution admission

Drivers require public-call/UI evidence, valid positive controls, independently
verified transaction/crypto/state outcomes, parsed nonempty verifier receipts,
complete shutdown ledgers and two fresh native repetitions. Proposal tests
check inventory accountability and safety boundaries only; they execute no
wallet, certify no fixture and close no conformance gate.

Native dispatch requires its own bounded work order, frozen artifact/environment
and oracle identities, cost reconciliation and stop conditions. This proposal
authorizes no paid device allocation, standing capacity or public-mainnet
spending. Unknown operator, development-agent, storage and allocated-capacity
costs remain unknown. A new passing result cannot rewrite the original failed
or blocked sample.

The prospective ISI-4@5.0.0 conditional driver now implements 84 independent
predicates, including exact ASCII/UTF-8 basket boundaries, transaction/reference
branches, populated query filters/includes/pagination, direct certificate
acquisition, selective revelation and 10 authenticated issuance response modes.
The [executable policy](../programs/ISI-4/profiles/native-conformance-5.0.0/conditional-oracle-1.0.0.json)
adopts the typed 300-byte basket maximum and the direct broadcast-option
definition for this new profile. The proposal above remains the preserved design
baseline; no older interpretation, gate or evidence changes.

The [306-variant implementation map](../programs/ISI-4/proposals/native-coverage-closure-20261111-execution-map.json)
links implemented portions to exact predicates and separately identifies native
capability blockers, permission-module ownership and unfinished conditional
work. A mapped implementation is not a passing native qualification. The
reference-wallet engineering preflight exercised 123 public calls and 10 actual
authenticated issuer exchanges; its independent replay retained 69 PASS, 14 FAIL
and 1 BLOCKED. Depth 12 limits, query totals, namespace acceptance and alternate
revealer behavior remain visible reference findings. Native 5.1.1 observations
are required before any prospective obligation can be declared satisfied.

The new native plan retains a strict admission boundary for a transaction matching
a denied payment through final service shutdown. Such a leak is retained as a
SUT safety failure and cannot qualify the environment. Other conditional
malformed transaction returns can remain scored native failures when the exact
independent predicate rejects the same observation; their qualification receipt
explicitly excludes them from transaction-proof claims. Valid-shaped returns
must still match independent storage and the declared mined payment roots.
The existing recursive depth32 observer bound remains explicit.

The wallet-side fixes are proposed separately in
[Yours Wallet PR368](https://github.com/yours-org/yours-wallet/pull/368), with100
passing tests and a successful production build on CI43140694759. The artifact
built from the synthetic merge2d4a9af has the exact tree of headf9faaaba and is
an engineering candidate. It is distinct from the unchanged official5.1.1 ZIP
admitted by this profile. No native result is inferred from source or unit tests.
