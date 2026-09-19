# Common adapter contract

Version 1.0.0 — draft laboratory control protocol. Adapter implementation is tracked in [implementation status](../docs/implementation-status.md).

Adapters are replaceable executors in any language. They expose structured requests/responses over a pinned local channel; the coordinator supplies a run token, logical step ID, idempotency key, dependency lock, deadline, and expected capability contract. An adapter returns observations or a typed infrastructure error. The evaluator determines the verdict. The laboratory adapter follows this contract; wallets are driven through their ordinary supported interfaces. ISI-4 admission follows [production-fidelity intake](../docs/intake.md).

| Operation | Contract |
| --- | --- |
| `describe` | Declare artifact kinds, platforms, substrates, lifecycle/schema version, supported network configuration, integration routes, and limitations. |
| `verify` | Verify the exact submitted bytes, signatures, platform and dependencies against the admitted lock. |
| `install` | Install original bytes into the leased clean guest; record resulting install inventory. |
| `configure` | Apply supported settings for the selected profile, explicit service endpoints, origin mapping, and isolated laboratory identity. |
| `initialize` | Complete onboarding through supported automation/UI; record choices and a commitment identifying the fixture identity. |
| `fund` | Receive/import the profile’s funding fixture; independently assess ownership, provenance, and declared spending eligibility. |
| `ready` | Prove semantic initial state, chain identity, permissions and network closure. |
| `drive` | Execute one versioned vector step through the specified public interface; capture raw results. |
| `observe` | Export raw protocol/state evidence with causal step and artifact provenance. |
| `reset` | Restore the exact declared baseline and verify that previous run state is absent. |
| `stop` | Flush evidence and report cleanup completion before releasing the resource lease. |

Production adapters must specify request schemas, response schemas, capability negotiation, cancellation, bounded retries of idempotent setup only, and crash recovery. Configuration and reset are explicit operations; a hidden restore of a pre-funded vendor-specific wallet snapshot cannot replace an equally available onboarding contract. Snapshots may optimize later runs only after baseline creation and equivalence have been independently established.

Production-fidelity profiles use ordinary supported configuration and unchanged production releases. A special test build has a separate SUT identity and cannot stand in for the production artifact. An adapter must not modify transaction semantics, replace a wallet method with a harness implementation, suppress permission decisions, or manufacture observations.

Native automation may use public accessibility/test frameworks and documented app hooks under the same admission requirements. Record every hook and test entitlement. Wallet private keys and RNG internals need not be disclosed for semantic-level qualification.
