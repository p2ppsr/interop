# Foundational charter

Version 1.0.0 — production-fidelity amendment adopted 2026-09-18; founding charter adopted 2026-09-17.

## Purpose

The Transaction Processing Network Interoperability Laboratory (TPNIL) advances reliable interoperability on the BSV Blockchain through impartial evaluation, reproducible testing, and durable evidence. It maintains Interoperability and Standardization Initiatives (ISIs) and the Integrated Testing and Conformance Validation Environments (ITCVEs) in which software is assessed.

The laboratory acts without fear or favor. Participation is open on equal published terms to individuals, commercial entities, proprietary implementations, and open-source projects. Technical results depend on published criteria and observed behavior. Sponsorship, affiliation, popularity, and contribution history confer no preference.

## Mandate

TPNIL develops and maintains end-to-end testing primitives, independent test oracles, deterministic runners, integrated test stands, conformance vectors, acceptance criteria, and permanent evaluation journals. Each finding identifies the evaluated artifact, applicable requirements, environment, versions, platforms, counterpart implementations, and supporting evidence. Its scope is limited to the behavior evaluated.

An ISI defines interoperability conditions, authoritative references, profiles, acceptance criteria, and interpretation decisions. An ITCVE defines the dependency boundary, initial state, observation controls, and reproducibility conditions. A System Under Test (SUT) is an admitted artifact identified by its exact bytes and configuration.

## Principles

1. **Equal participation.** Requirements and admission terms apply equally to all implementations, including reference software. Proprietary SUTs are eligible with lawful access to the canonical artifacts for independent evaluation; source disclosure is optional.
2. **Published criteria.** Requirements precede scored evaluation. Changes follow prospective versioning and review. Implementers may propose vectors and contest interpretations through the same process.
3. **Independent judgment.** Normative specifications govern evaluation. Gaps and contradictions receive explicit, versioned interpretations. Reference behavior informs investigation; adopted criteria determine the result.
4. **Complete reporting.** Reports preserve successful, failed, blocked, inconclusive, and erroneous attempts, with coverage and omissions. Sponsors and submitters cannot purchase favorable results or suppress completed reports under the applicable publication agreement.
5. **Reproducibility.** Defined initial conditions, canonical artifacts, independent predicates, and retained raw evidence support repeatable results. Claims distinguish byte-exact replay from semantic repeatability.
6. **Durable records.** Journals are append-only. Corrections, appeals, withdrawals, and replacements preserve and reference prior records. Cryptographic identifiers, independent checkpoints, and distributed archives support verification over time.
7. **Accountable governance.** Authority, decisions, conflicts, funding, appeals, and succession are recorded. Review of disputed results is independent of the subject implementation and original decision.

## Stewardship and scope

PEER TO PEER PRIVACY SYSTEMS RESEARCH LLC, an Oregon limited liability company, is the founding steward. The [governance doctrine](GOVERNANCE.md) establishes its responsibilities, prospective founding participation, and transition to meritocratic, multi-stakeholder governance. Original laboratory materials use the [Open BSV licensing policy](LICENSE.md). Submitted SUTs retain their owners' rights under separate evaluation and archival terms.

The laboratory's governance vision is meritocratic and based on rough consensus: responsibility grows through sustained contribution and sound judgment, and technical decisions follow open deliberation and implementation evidence. The Internet and Linux ecosystems are leading models for this institutional ambition. These principles guide every future stewardship arrangement.

Two provisional paths are expressly open. Accepted founding participants may activate a council under the standing conditions in [governance](GOVERNANCE.md#standing-council-path), with authority to succeed P2PPSR as steward. The laboratory also maintains a standing offer to explore transfer to BSV Association's control as a means of achieving collaborative, multi-stakeholder governance. TPNIL is currently unaffiliated with BSVA, and no such transfer or agreement has taken effect. Other arrangements remain possible under the same governance principles.

Initial findings are experimental. Certification requires independent reproduction, qualified reviewers, an adopted certification scheme, and a functioning appeals process. Conformance findings address defined interoperability behavior; they provide no general security, financial, or product warranty. Evaluation uses isolated laboratory identities and the funding model defined by the selected profile. ISI-4 evaluates production mainnet wallet binaries against explicitly configured controlled services and isolated fixtures, without requiring regtest support. [ISI-4 decision 0001](programs/ISI-4/decisions/0001-production-fidelity.md) defines that boundary.

The repository is private during establishment. Public release requires a recorded decision by the current steward under the governance doctrine.

## Continuity

Charter revisions, program changes, and interpretations follow recorded proposals. Program identifiers remain permanent. Changes in stewardship, implementation, or participating vendors preserve existing grants, retained evidence, and the meaning of historical results. Succession and archival recovery are conditions of institutional operation.
