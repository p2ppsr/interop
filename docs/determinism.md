# Determinism contract

Determinism means that the same admitted artifacts, initial state, inputs, environment profile, and oracle yield the same defined result. Each vector specifies its comparison domain before execution.

## Levels

- **D0 — byte replay:** controlled primitives and serialized fixtures produce identical expected bytes and semantic results.
- **D1 — semantic replay:** native or proprietary artifacts may use secure randomness and real schedulers. Vectors define exact invariants, causal ordering, bounded convergence, and permitted field variation. Raw bytes are retained; signatures, content identities, relationships, and state transitions are verified before normalization.
- **D2 — observation only:** dependencies or normalization remain uncontrolled. Results support research and are ineligible for deterministic conformance findings.

Native wallets may qualify under D1. Controlled fixtures use D0, with fixture keys and seeded randomness confined to disposable regtest data. Production randomness and nonce uniqueness remain intact. Modified executables have distinct SUT identities.

## Closed execution

Preparation may download artifacts. Execution begins after every dependency is local and digest-verified, including container layers, packages, OS images, firmware, browser and device drivers, certificates, DNS configuration and responses, funding chain, content, and oracle. External routes and update checks are disabled. Denied egress and unexpected requests are recorded. Licensed artifacts require lawful self-contained evaluation entitlements.

The environment pins genesis, chain identity, consensus and policy settings, mining template and time/nonce schedule, coinbase maturity, fee policy, block intervals, transaction order, header state, and broadcast events. Funding uses locally mined mock coins. A Teranode integration profile requires the admitted Teranode implementation.

Wall-clock timestamps provide audit metadata; fixture behavior and deadlines use the declared logical clock. Independent timestamp attestation is a separate evidence property. Native execution records OS build, firmware, CPU, locale, timezone, rendering configuration, and scheduling limits. Screenshots corroborate UI behavior, while transaction assertions use protocol and state evidence.

## Concurrency and repetition

Parallel cells have independent writable namespaces, chain state, identities, origins, ports, and resource reservations. Immutable artifacts may be shared. Shared mutable state is confined to explicitly coordinated interoperability topologies, each with a recorded event order, partitions, and convergence barriers.

Every qualifying vector runs at least twice from clean state. Comparison covers declared semantic projections and individual outcomes. A disagreement produces INCONCLUSIVE and an investigation. All attempts are preserved; later success leaves earlier findings intact. Certification additionally requires independent reproduction.
