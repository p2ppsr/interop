# Conformance and verdict model

The keywords MUST, MUST NOT, SHOULD, and MAY express laboratory obligations within adopted profiles. Draft statements define proposed requirements. Each requirement has an ID, origin (`standard`, `laboratory-profile`, or `open-interpretation`), a pinned citation, observable assertion, applicability, and vector coverage.

## Four distinct identities

An ISI defines what is assessed. An ITCVE defines the integration conditions. A SUT defines immutable submitted bytes and configuration. A run binds these with a platform/counterparty matrix, execution plan, independent oracle, and evidence. A reference node is a fixture provider, not proof of correctness.

## Outcomes

| Outcome | Meaning |
| --- | --- |
| PASS | Every required applicable assertion ran and passed with complete evidence under the declared profile. |
| FAIL | At least one validly executed required assertion contradicts its accepted criterion. |
| BLOCKED | A prerequisite, admitted artifact, capability, or runner was unavailable before a valid observation. |
| INCONCLUSIVE | Evidence exists but cannot distinguish allowed from disallowed behavior; unresolved semantics or nondeterminism prevent a verdict. |
| ERROR | Laboratory execution, schema, integrity, or oracle malfunction. |
| NOT_APPLICABLE | The profile's predeclared applicability rule excludes the assertion; requires a recorded reason. |

Aggregate precedence is ERROR, FAIL, INCONCLUSIVE, BLOCKED, PASS. Reports include the aggregate and every individual outcome. Applicability is fixed before execution. Missing required observations and empty suites prevent PASS. A timeout is FAIL only if a specified SUT deadline is observed in a healthy harness; otherwise classify infrastructure failure or inconclusive evidence.

The offline core emits **LAB_SELF_TEST_ONLY** results using equality assertions against synthetic observations. Qualification of production predicates, cryptographic validators, device observations, and protocol execution follows the [roadmap](../ROADMAP.md).

## Attribution and scope

Keep wallet, application, substrate, storage, overlay, and infrastructure findings distinct. A failing combination does not establish which component is faulty; follow-up substitution runs identify causes. Qualification reports identify exact OS/browser/architecture, local or remote storage, transport, counterpart digest, and profile. A pairwise matrix is useful exploration but cannot substitute for required combinations. Declare uncovered cells explicitly.

Full BRC-100 conformance is not demonstrated by ToDo. A complete boundary inventory must cover every applicable method, transport, argument/result form, specified error, permission interaction, and referenced primitive before a broader profile can become normative. ISI-3 storage RPC is not BRC-100 itself; pin its independent contract and resolve implementation differences explicitly.
