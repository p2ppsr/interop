# ISI-4 decision 0001 — production fidelity and controlled services

Adopted 2026-09-18. Applies to ISI-4 1.0.0 and ITCVE-1 1.0.0. Supersedes the uniform wallet-regtest prerequisite in ISI-4 0.1.0 and decision D-010 for this program. The original versions remain retained.

## Objective

ISI-4 measures the behavior of software distributed for ordinary mainnet use. Intake adapts the laboratory to the implementation's supported configuration and observable interfaces. A wallet need not implement regtest, a laboratory API, a special build, or an initialization contract to participate. Configuration differences and their effect on the evaluated behavior are part of the evidence.

## Initial execution boundary

The initial profile uses unchanged mainnet wallet binaries with explicitly configured ITCVE services and isolated fixtures. It does not spend or broadcast on the public mainnet. Mainnet is the wallet's network configuration; the fixture service is a declared dependency model. Results identify both properties separately.

The laboratory first uses ordinary configuration and supported integration mechanisms. Service endpoints use identities controlled by the operator or expressly provided by their owners. Ordinary proxy routing may support network accounting while preserving destination authentication. It does not itself establish plaintext observation or response control. Missing configuration or observation produces a documented coverage limit, not a wallet failure or an invented passing result.

A public-mainnet observation profile would require separate scope, funding controls, dependency records, and event-based criteria. Recorded live observations can be replayed through deterministic evaluators; public-network execution cannot guarantee an identical chain, timing, or outcome on a subsequent run.

## Intake and fidelity

[The intake process](../../../docs/intake.md) records artifact identity, supported configuration, intervention effects, service coverage, initial state, observability, repeatability, and artifact rights. Source analysis supplies hypotheses; installed-binary observations establish runtime behavior. Local and remote storage modes are separate configurations.

Only the laboratory's adapters implement the control lifecycle. The SUT is driven through its ordinary interfaces. The laboratory preserves its executable, security decisions, permission prompts, and cryptographic behavior. A patched or special-purpose build receives a separate identity and does not substitute for the production candidate.

## Initial demonstration

The first demonstration covers ISI-4-V001 through V004: intake and initialization, creation of an encrypted ToDo token, reconstruction after a cold application reload, and redemption. These vectors require exact fixtures and independent transaction, script, amount, basket, encryption-context, and state assertions. A limited demonstration reports only its executed scope; full BRC-100 coverage remains a separate undertaking.

The goal is an accurate result. FAIL, BLOCKED, and INCONCLUSIVE are retained alongside PASS. Acceptance criteria remain fixed during a run.
