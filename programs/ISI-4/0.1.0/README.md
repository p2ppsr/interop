# ISI-4: BRC-100 wallet-to-application interoperability

Version **0.1.0**, status **DRAFT**, profile `wallet-todo`, environment **ITCVE-1@0.1.0**.

The [catalog](catalog.json) defines draft requirements, vector plans, references, observations, evidence, and outstanding prerequisites. `npm run check` validates its structure. Profile adoption requires exact fixtures and independent executable oracles for every mandatory requirement.

| Requirement / vector | Intended assertion family | Requirement origin | State |
| --- | --- | --- | --- |
| ISI-4-R001 / ISI-4-V001 | Uniform regtest onboarding and funding | laboratory-profile | Draft; not executable |
| ISI-4-R002 / ISI-4-V002 | Create encrypted ToDo token | standard | Draft; not executable |
| ISI-4-R003 / ISI-4-V003 | List, decrypt and cold reload | standard | Draft; not executable |
| ISI-4-R004 / ISI-4-V004 | Redeem token and verify spendability | standard | Draft; not executable |
| ISI-4-R005 / ISI-4-V005 | Permissions and wallet communications substrates | standard | Draft; not executable |
| ISI-4-R006 / ISI-4-V006 | Broadcast options and transaction lifecycle | open-interpretation | Draft; not executable |
| ISI-4-R007 / ISI-4-V007 | Data portability and counterpart replacement | laboratory-profile | Draft; not executable |
| ISI-4-R008 / ISI-4-V008 | Comprehensive wallet boundary coverage | laboratory-profile | Draft; not executable |

## Acceptance

PASS requires every applicable mandatory vector to execute successfully in two clean repetitions with matching declared semantic projections. Reports include every matrix cell and attempted outcome. Prerequisites, applicability, and other outcomes follow the [common conformance model](../../../docs/conformance-model.md).

## Profile boundaries

The initial subjects are the nominated compiled ToDo application and canonical BSV Desktop binaries. Each is independently identified. All wallets must meet the same regtest admission contract. Native iOS, Android, desktop and mobile-wallet-browser profiles require their own qualified runners. The ToDo subset does not imply full BRC-100 coverage.

## Changelog

0.1.0: initial foundation and draft vector plans; no SUT execution.
