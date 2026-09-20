# ISI-4 decision 0003 — hybrid, independently reproducible laboratory

Recorded 2026-09-20 by the founding steward.

TPNIL adopts a hybrid execution architecture. The repository defines the laboratory protocol, plans, adapters, oracles, provisioning contracts, and evidence formats. The same run is invocable from a local terminal, an independently operated installation, or GitHub Actions. A scheduler does not define the environment or determine a result.

Controlled HTTP services and application origins use portable, digest-pinned artifacts and OCI images. Docker Compose is the baseline single-host topology. Kubernetes may supply equivalent isolated capacity for concurrent matrices and the integrated stack. Independent reproduction does not require access to P2PPSR infrastructure, GitHub credentials, or a Kubernetes cluster.

Native desktop SUTs run in clean disposable virtual machines restored from qualified bases. Mobile SUTs use a declared simulator or physical device according to the submitted artifact and vector. Native environments retain no repository or evidence-archive credential. Each run records the base identity, host and guest platform, installed artifact, state reset, network policy, automation, and evidence-capture capabilities.

GitHub-hosted runners execute source validation and portable tests. Qualified self-hosted capacity may execute native runs through single-job ephemeral runners or a credential-minimal broker. GitHub workflow artifacts are transport copies, not the permanent journal or sole evidence archive.

The first implemented lane qualifies the canonical `todo-ts` compiled web root, logical application origin, static dependency closure, repeatable responses, content-addressed evidence retention, and offline verification. Its claim is `INFRASTRUCTURE_QUALIFICATION_ONLY`. It establishes no wallet behavior and cannot satisfy ISI-4 V001–V004.

The first native lane uses an Apple-silicon macOS guest under Apple Virtualization through a pinned Tart release and base-image digest. Admission requires successful provisioning, ordinary installation of BSV Desktop 2.8.5, clean reset, controlled service routing, UI automation, raw network and screen evidence, and two repeated qualification runs. Until those conditions are recorded, decision 0002 continues to block native SUT execution.
