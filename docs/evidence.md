# Evidence, journals, and retention

A run envelope binds UTC start and end timestamps, laboratory revision, workspace state, ISI/ITCVE/profile identifiers and versions, SUT manifests and digests, platform matrix, dependency closure, initial state and seed identifiers, plan, adapter, oracle, schema, vector corpus, logical schedule, observations, outcomes, and limitations. Timestamp metadata is separate from the deterministic semantic-result digest.

Raw observations are retained before normalization. Evidence includes protocol requests and responses, transaction bytes and proofs, state commitments, installation and provisioning records, device logs, relevant screenshots, cleanup status, and denied external requests. Every observation identifies its adapter and execution step. Official signing keys are separate from disposable fixture identities.

## Integrity and verification

The offline core stores blobs at `objects/<sha256>`, hashes canonical JSON, and links journal entries through `previous`. Entry hashes bind sequence, timestamp, run record, and predecessor. Verification checks every link and referenced object. Replay recomputes outcomes from stored inputs and compares them with the recorded report.

A single-writer lock serializes appends. The journal entry is the commit point; unreferenced staging objects are excluded from published evidence. Interrupted writes require inspected recovery under the [operator procedure](operator-quickstart.md). Missing or modified content fails verification.

These mechanisms detect changes relative to a trusted checkpoint. Official publication also requires signed releases and checkpoints, protected append-only review, independently held checkpoints and mirrors, and enforced retention terms. Independent observation and reproduction establish confidence in the recorded inputs. [Repository controls](repository-controls.md) records the implementation of these publication requirements.

## Storage and retention

Accepted journal entries and small evidence objects are committed to repository history. Large binaries and raw logs reside in mirrored, content-addressed archives with signed inventories, availability checks, and offline export bundles. Replay requires retrievable artifact bytes as well as their digests.

Public requirements and adjudication history have permanent retention by default. Artifact retention and access terms are agreed before admission. Corrections and certification withdrawals are appended as new records referencing the original digest; original results and failed attempts remain retained.

Evidence classification occurs before publication. Public evidence uses synthetic identities and fixture funds. Restricted evidence is encrypted and separately access-controlled under recorded terms. Applicable confidentiality or erasure obligations are addressed through that separation, with a public tombstone recording any later retention change.
