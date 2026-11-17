# ISI-5 0.1.0 — optional UMP and wallet profile semantics

ISI-5 is an opt-in compatibility program for wallets that implement UMP-backed
accounts and multiple wallet profiles. Selection of `ump-profiles` requires all
ten vectors in [the catalog](catalog.json). ISI-4 acceptance, its ToDo flows,
BRC-100 method inventory and retained results are independent of ISI-5. A wallet
that does not select this program acquires no new ISI-4 failure or requirement.
These requirements are laboratory profile semantics, not additions to BRC-100.

The executable observation evaluator is available. Native UI/protocol collection,
artifact/platform admission and controlled-service qualification remain separate;
[implementation status](../../../docs/implementation-status.md) records maturity.
The fixture oracle carries its own claim marker; a synthetic pack cannot be
promoted by changing only the plan mode. The evaluator emits `ENGINEERING_OBSERVATION_ONLY` for actual observation records
and `LAB_SELF_TEST_ONLY` for synthetic fixtures. It does not issue certification
or promote either claim to a SUT conformance finding.

## Required flows and independent outcomes

| Vector | Operation | Required outcome |
| --- | --- | --- |
| V001 | Create secondary | Intended UMP successor and profile inventory are independently visible; durable revision precedes success; creation preserves the existing selection. |
| V002 | Switch live | Fresh BRC-100 identity is secondary; UMP remains unchanged; old replies/caches are fenced, switches serialize and an active financial call excludes a switch. |
| V003 | Terminate/relaunch | Whole-process exit and relaunch retain selected ID, actual key, profile inventory and UMP without wallet logout. Home/background alone is insufficient. |
| V004 | Create third while secondary is active | Root mutation creates one original action; secondary remains active through creation and reopen without wallet logout. |
| V005 | Reconcile stale state | Startup/foreground discover the authenticated successor while preserving selection. Discovery failure retains state and refuses new UMP mutations instead of creating an account. |
| V006 | Fail a local save | Failure preserves committed state, withdraws serving readiness and blocks calls. Explicit refresh after removing the fault commits state without a financial action. |
| V007 | Recover an uncertain update | Recovery binds root ownership, intended profiles, exact predecessor/outpoint and original receipt bytes. Replay reuses those bytes; admission without a receipt retains a pending checkpoint and creates no replacement. |
| V008 | Missing profile, failed builder, account replacement | Remote removal cannot silently serve root. Failed activation preserves the prior actual identity or refuses APIs. Delayed callbacks cannot overwrite a replacement account. |
| V009 | Explicit application re-login | A controlled application's fresh authenticated peer and server principal match secondary after explicit sign-out/sign-in, without a page reload, payment replay or account linking. |
| V010 | Mirrors, logout and background work | Canonical revision wins over a stale mirror; conflicting accounts are retained/refused. Logout disables mirrors, prevents old-copy login and defers background work. The declared root/profile notification identity contract is preserved. |

Profile names and UI labels are not identity oracles. A fixture oracle independently
binds the root and replacement account to canonical compressed secp256k1 public
keys before the run. Secondary and third profile bindings are outputs of an
independent observer over the newly published UMP records; their entropy is not
predetermined. The derived oracle binds the frozen plan and observer digest,
unchanged root/replacement identities and exact source UMP evidence digests. Root, secondary, third and a replacement account have distinct identities.
A frozen `optionalConsumers` inventory declares mirror and background consumers.
Absent consumers require independent absence-inventory evidence rather than a
new implementation; consumer-specific assertions are applied only when present.
The result retains that scope, and logout retention remains mandatory.
Use the controlled fixture's independently derived keys or an admitted equivalent
oracle, rather than copying expected values from the SUT response being tested.
The selected profile is a device preference; switching alone does not publish a
UMP transaction. A valid remote deletion requires an explicit unavailable state
and user selection. The frozen `notificationIdentityRole` may be root-scoped or profile-scoped;
the admitted wallet's declared contract controls that separate assertion.

A website cookie may continue to identify the previous account after a wallet
switch. V009 evaluates fresh wallet identity and an explicit authenticated login
separately. A generic controlled BRC-103 fixture can replace any named commercial
application; the program does not require BitGenius or a third-party account.

## Run and evidence contract

Freeze the catalog, `tpnil-isi5-plan@0.1.0`, baseline fixture/observer, exact SUT bytes,
platform/device kind, service closure and fault schedule before collecting data.
The plan binds the catalog's TPNIL-JSON-1 hash, baseline fixture path/size/SHA-256, independent observer digest,
SUT/environment digests, network and selected program. Every run binds that plan
hash and its derived profile-oracle artifact. The baseline fixture uses
`tpnil-isi5-fixture@0.1.0` with `claim`, `root` and `replacement` records; each
contains `profile` and `identity`. The derived `tpnil-isi5-oracle@0.1.0` adds
`secondary`, `third`, `planHash`, `observerSha256` and `sources.secondary/third`
artifact descriptors. The v0.2 catalog/index schemas add ISI-5 while retaining the original v0.1
schemas for historical records. ISI-5 identifiers and vector versions are permanent.

The plan selects isolated controlled services and prohibits public broadcast.
Supported mainnet-format controlled-service configurations preserve the existing
ITCVE funding ancestry, header/Merkle, WAB, UMP and submission requirements. TTN
or another test network is a separately declared engineering configuration; it
cannot inherit mainnet, production-binary or physical-device admission. Personal
wallets, customer recovery data and public-mainnet spending are excluded. Normal
wallet trust and permission controls apply. Device execution requires a bounded,
costed work order under the laboratory's shared-device policy.

A record supplies all ten case IDs. Each case references one normalized JSON
projection and separate role-labelled raw evidence files, all bound by size and
SHA-256. The catalog lists the required roles; V007 also retains raw original
AtomicBEEF under `atomic-beef`. Path traversal, symlinks, duplicate vector IDs,
unknown vectors, plan/catalog substitutions and changed bytes fail the evidence
contract. Absent cases, semantic facts or required raw evidence produce BLOCKED;
observed contradictions produce FAIL. The command exits successfully for completed
PASS/FAIL/BLOCKED evaluations and exits with code 2 for invalid evidence.

```sh
node bin/tpnil.mjs evaluate-wallet-profiles plan.json record.json evidence-root
```

The plan and record schemas are
[wallet-profile-plan](../../../schemas/wallet-profile-plan.schema.json) and
[wallet-profile-record](../../../schemas/wallet-profile-record.schema.json).
The fixed predicates and normalized field names are in
[the evaluator](../../../src/wallet-profiles.mjs). State projections contain
`selected`, `identity`, `root`, `profiles`, `ump`, `revision`, `snapshot`, and
`ready`. Identity values are canonical compressed public keys; snapshot values
are SHA-256 only. Raw snapshots, wallet keys, OTPs and passwords remain in the
protected fixture custody system, outside shared observation packs.

A normalized projection is not proof that a native action occurred. The collector
retains the source UI/protocol/lifecycle/storage/application evidence. An admitted
independent observer validates UMP owner/signature, lineage and transaction proof,
including that the original receipt spends its exact predecessor. This evaluator
checks digest integrity and semantic consistency of those projections; it does
not implement a second blockchain verifier, authenticate a collector, prove
prospective freezing, or establish device admission. Repeated fingerprints and
transaction counts require independent observer records, not SUT-authored counters.

## Reproduction and regression

Generate a new synthetic pack and evaluate it:

```sh
node scripts/create-isi5-self-test.mjs out/isi5-self-test
node bin/tpnil.mjs evaluate-wallet-profiles out/isi5-self-test/plan.json out/isi5-self-test/record.json out/isi5-self-test
node --test test/wallet-profiles.test.mjs
```

Every generated raw fixture, including its non-transaction AtomicBEEF placeholder,
is labelled LAB_SELF_TEST_ONLY. Regression tests seed stale/default identity,
background-only restart, lost creation, failed save, duplicate/replacement action,
missing checkpoint, obsolete callback, cached authenticated peer, logout revival,
and missing/tampered evidence. Synthetic success tests the evaluator only.

Native adapter qualification freezes supported creation/selection controls,
observed process-exit boundaries, BRC-100 transport, fault injection and independent
state/receipt readers before scored execution. Run two fresh repetitions on each
admitted wallet/platform combination and compare semantic outcomes. Retain every
failed attempt; a later correction creates a new result and references the old.
Wallet-specific UMP internals and native automation adapters can be added after
that admission without coupling this program to SQLite, Toolbox, or ISI-4.
