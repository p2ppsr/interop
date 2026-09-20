# Production SUT intake

Version 1.0.0. Adopted for ISI-4 1.0.0.

Intake establishes what the laboratory can faithfully observe in a production implementation and under which conditions. It preserves the submitted artifact and accommodates its ordinary configuration. Laboratory integration capability is assessed separately from software conformance.

## Procedure

1. **Identify the subject.** Record publisher, exact release, artifact digest and size, platform, signatures, and source revision where available. Preserve release metadata and distinguish claimed provenance from verified bytes. Existing user wallets are outside the intake environment.
2. **Inventory ordinary behavior.** Record first-run configuration, authentication, permission prompts, storage choices, transaction submission, proof and header acquisition, discovery, updates, telemetry, and other observed dependencies. Source observations identify candidate routes; runtime traces confirm them.
3. **Select the configuration.** Prefer normal UI or documented configuration. Record every changed setting, its purpose, supported configuration evidence, and potential effect on measured behavior. Keep local and remote storage results distinct. Custom builds and semantic patches are separate SUTs.
4. **Qualify the environment.** Verify a clean runner, artifact installation, isolated identity and state, reset and teardown, and egress controls. Explicitly configured endpoints use operator-controlled or owner-authorized identities. Destination authentication and application trust controls remain active.
5. **Establish the service boundary.** Inventory renderer, background, storage, and subprocess traffic independently. For each relevant service, record the configured endpoint, observed destination, request/response visibility, event control, and evidence. Uncontrolled mandatory dependencies block the affected controlled-service vectors. Optional limitations remain visible in coverage.
6. **Define the initial state.** Pin the fixture transactions, headers, proofs, storage records, funding provenance, and wallet import sequence. State which properties are validated independently and which are supplied by the fixture model. A mainnet-formatted fixture is not a public-mainnet UTXO or proof of network acceptance.
7. **Map assertions.** Bind each vector to its observable evidence and independent oracle. Record timing barriers, permitted randomness, exact semantic comparison, and failure classification before execution. Instrumentation effects and unresolved interpretations remain explicit.
8. **Reproduce and review.** Verify reset and repeat the initial state. Preserve all observations and attempts. Review configuration fidelity, known differences, coverage, and retention permissions before admitting the configuration for scored evaluation.

## Qualitative criteria

| Criterion | Required evidence |
| --- | --- |
| `artifact-identity` | Verified artifact bytes and publisher/release binding |
| `production-fidelity` | Original installation, supported settings, and recorded intervention effects |
| `runner-isolation` | Clean guest identity, egress policy, state separation, and teardown |
| `service-coverage` | Runtime routing and observations for every required service and process |
| `initial-state` | Funding, header, proof, storage, and wallet-state provenance |
| `observation-coverage` | Requirement-to-evidence mapping and independent predicates |
| `repeatability` | Clean reset and repeated baseline observations |
| `retention-rights` | Accepted artifact and dependency retention/replay terms |

Each criterion has a finding, evidence references, and one of `verified`, `source-observed`, `unresolved`, or `not-supported`. Source observations do not satisfy runtime criteria. A `not-supported` integration capability limits coverage without assigning a SUT conformance failure. There is no weighted score that can compensate for a missing mandatory observation.

## Review command

```sh
node bin/tpnil.mjs review-intake suts/intake/bsv-desktop-2.8.5.json out/artifacts/BSV-Desktop-2.8.5-arm64-mac.dmg
```

The command validates the record, checks referenced evidence digests, streams and verifies the candidate artifact, and reports every unmet criterion. `INTAKE_REVIEW_ONLY` identifies the output. `READY_FOR_EXECUTION` means the required evidence has been recorded and the structural checks pass; reviewers remain responsible for validating the observations. It is not a SUT verdict. `BLOCKED` exits 1; malformed records or integrity failures exit 2.

This command performs no installation, networking, wallet calls, or transaction broadcast. Actual execution requires the admitted adapter and environment.

The [BSV Desktop 2.8.5 intake](../suts/intake/bsv-desktop-2.8.5.md) is the first application of this process.

The first retained [intake review](../journals/intake/2026-09-18/bsv-desktop-2.8.5-macos-arm64.json) records BLOCKED readiness. It binds the evidence and artifact digests available at that time and remains preserved when later reviews are added. Native qualification now supplies installation and bridge evidence; service coverage, fixture state, observation coverage, and retention terms still prevent a replacement `READY_FOR_EXECUTION` review.
