# Common adapter contract

Version 0.1.0 — draft protocol. Adapter implementation is tracked in [implementation status](../docs/implementation-status.md).

Adapters are replaceable executors in any language. They expose structured requests/responses over a pinned local channel; the coordinator supplies a run token, logical step ID, idempotency key, dependency lock, deadline, and expected capability contract. An adapter returns observations or a typed infrastructure error. The evaluator determines the verdict. Every wallet, including BSV Desktop, follows this common contract.

| Operation | Contract |
| --- | --- |
| `describe` | Declare artifact kinds, platforms, substrates, lifecycle/schema version, regtest capability and limitations. |
| `verify` | Verify the exact submitted bytes, signatures, platform and dependencies against the admitted lock. |
| `install` | Install original bytes into the leased clean guest; record resulting install inventory. |
| `configure` | Select regtest chain, local service endpoints, deterministic origin mapping and fixture-only identity policy. |
| `initialize` | Complete onboarding through supported automation/UI; record choices and a commitment identifying the fixture identity. |
| `fund` | Receive/import the declared local funding transaction; independently confirm ownership, maturity and usability. |
| `ready` | Prove semantic initial state, chain identity, permissions and network closure. |
| `drive` | Execute one versioned vector step through the specified public interface; capture raw results. |
| `observe` | Export raw protocol/state evidence with causal step and artifact provenance. |
| `reset` | Restore the exact declared baseline and verify that previous run state is absent. |
| `stop` | Flush evidence and report cleanup completion before releasing the resource lease. |

Production adapters must specify request schemas, response schemas, capability negotiation, cancellation, bounded retries of idempotent setup only, and crash recovery. Configuration and reset are explicit operations; a hidden restore of a pre-funded vendor-specific wallet snapshot cannot replace an equally available onboarding contract. Snapshots may optimize later runs only after baseline creation and equivalence have been independently established.

Supported regtest configuration may use local configuration files, command-line options, documented UI, or a test-only distribution. Any alternate build is a separate SUT digest and label. An adapter must not modify transaction semantics, replace a wallet method with a harness implementation, suppress permission decisions, or manufacture observations.

Native automation may use public accessibility/test frameworks and documented app hooks under the same admission requirements. Record every hook and test entitlement. Wallet private keys and RNG internals need not be disclosed for semantic-level qualification.
