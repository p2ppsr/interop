# ISI-5: Multicast transaction and object delivery

Version **0.1.0**, status **DRAFT**, profile `multicast-delivery`, environment **ITCVE-2@0.1.0**.

ISI-5 evaluates delivery over the BSV Layered Multicast fabric between
unmodified BSV services. Every frame carries a per-flow sequence number, so
delivery is counted and each gap is detected, then repaired or reported.

- **Miner tier.** Transactions from BSV Broadcaster's propagation to Teranode,
  and the processor's subtree, block and header objects to Merkle Service and a
  header store.
- **Overlay tier.** BEEF objects between overlay hosts on the BEEF object
  plane, each ending in a BRC-22 submission.

The [catalog](catalog.json) defines draft requirements, vector plans, references, observations, evidence, and outstanding prerequisites. `npm run check` validates its structure. [ITCVE-2](../../../itcves/ITCVE-2/0.1.0/README.md) defines the environment.

| Requirement / vector | Intended assertion family | Requirement origin | State |
| --- | --- | --- | --- |
| ISI-5-R001 / ISI-5-V001 | Transaction frames, addressing and filtering | standard | Component qualification passes; scored vector remains draft |
| ISI-5-R002 / ISI-5-V002 | Fragmentation and reassembly | standard | Component qualification passes; scored vector remains draft |
| ISI-5-R003 / ISI-5-V003 | Gap detection and repair | standard | Component qualification passes; scored vector remains draft |
| ISI-5-R004 / ISI-5-V004 | Block, subtree and header objects | standard | Component qualification passes; scored vector remains draft |
| ISI-5-R005 / ISI-5-V005 | BEEF object plane | standard | Component qualification passes; scored vector remains draft |
| ISI-5-R006 / ISI-5-V006 | Bundling and shard manifests | standard | Component qualification passes; scored vector remains draft |
| ISI-5-R007 / ISI-5-V007 | Frame conformance corpus | standard | Two independent oracles pass; SUT adapter pending |
| ISI-5-R008 / ISI-5-V008 | Submission path through the fabric | laboratory-profile | Component qualification passes on the joined configuration; scored vector remains draft |
| ISI-5-R009 / ISI-5-V009 | Processor objects and proofs through the fabric | laboratory-profile | Component qualification passes on the joined configuration; scored vector remains draft |
| ISI-5-R010 / ISI-5-V010 | Repair under declared loss on the joined path | laboratory-profile | Component qualification passes on the joined configuration; scored vector remains draft |
| ISI-5-R011 / ISI-5-V011 | Overlay delivery between engines | laboratory-profile | Component qualification passes on the joined configuration; scored vector remains draft |
| ISI-5-R012 / ISI-5-V012 | BRC-22 submission boundary | standard | Runtime observations retained for go-overlay-services; scored vector remains draft |

V001 to V007 run in ITCVE-2's `harness` configuration and V008 to V011 in its
`joined` configuration. V012 needs only the server or client under test and a
recording engine.

## Acceptance

PASS requires every applicable mandatory vector to execute successfully in two clean repetitions with matching declared semantic projections. Reports include every matrix cell and attempted outcome. A `joined` run also retains ITCVE-2's ready and restore observations. Prerequisites, applicability, and other outcomes follow the [common conformance model](../../../docs/conformance-model.md).

## Profile boundaries

- The fabric is a transport between unmodified roles. The SUT can replace any
  fabric or bridge role. Teranode, BSV Broadcaster, Merkle Service and the
  overlay engines are digest-pinned support components, changed only by
  recorded configuration.
- Each observation is made at a boundary the unmodified services already
  expose, as byte identity or as counted delivery.
- A result applies to the executed configuration and component combination.

## Relationship to other programs

| Program | Relationship |
| --- | --- |
| ISI-1 | The miner tier follows the joined transaction path of [ISI-1 decision 0002](../../ISI-1/decisions/0002-executable-profiles.md). Here the processor's own blockchain notifications drive the announcements to Merkle Service, so that path runs end to end without a laboratory publisher. ISI-1 results and evidence are unchanged. |
| ISI-2 | The overlay tier ends in a BRC-22 submission. The [BRC-22 submit boundary vectors](../proposals/brc22-submit-boundary/0.1.0/README.md) define V012 and are proposed as inputs to ISI-2 V002 and V006. |

## Evidence

| Evidence | Plans | Journal |
| --- | --- | --- |
| Twelve harness plans, 55 scenarios | `infra/plans/multicast-fabric-*.json` | `journals/component-qualification/2026-11-07/` |
| Frame corpus, two independent oracles | `infra/plans/multicast-frame-vectors-*.json` | `journals/component-qualification/2026-11-07/` |
| BRC-22 runtime observations | `infra/plans/overlay-brc22-submit-boundary-go.json` | `journals/component-qualification/2026-11-08/` |
| Joined configuration: V008 and V009 with the ready condition, V010, V011, the restore condition | Written per run by `qualify.sh`; each journal retains its plan | `journals/component-qualification/2026-11-09/isi5-joined-portable-*` |
| Delivery-edge repair (V010) | `infra/plans/multicast-listener-nack-repair.json` | `journals/component-qualification/2026-11-09/multicast-listener-nack-repair` |

The first harness attempt is retained under
[`attempt-1/`](../../../journals/component-qualification/2026-11-07/attempt-1/README.md).
All results are `INFRASTRUCTURE_QUALIFICATION_ONLY`. The
[infrastructure guide](../../../infra/README.md#itcve-2-component-qualifications)
gives the commands.

## Provenance

Lightweb Inc. contributed this program under the Apache License, Version 2.0.
Jeff Harris of Lightweb Inc. authored the multicast BRCs it cites, and Lightweb
Inc. publishes the fabric components and bridges. Results involving them are
subject to the conflict rules in [governance](../../../GOVERNANCE.md).

## Changelog

0.1.0: initial program and draft vectors; harness and joined component qualifications and BRC-22 runtime observations retained; V011's repeat expectation made engine-neutral; no SUT conformance result issued.
