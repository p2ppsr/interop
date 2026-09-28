# Shared device infrastructure

TPNIL uses a tenant-isolated device project within Babbage's network-ops-owned
shared infrastructure. ProofRun uses a separate project and service identity.
Transport, cost admission and cleanup contracts are shared; laboratory vectors,
oracles, artifact admission and verdict authority remain in TPNIL.

The GCP device project is `babbage-device-tpnil` (`649305509516`). Its keyless
GitHub identity is `tpnil-device-worker@babbage-device-lab.iam.gserviceaccount.com`.
The AWS account is `380794909093`; TPNIL's Device Farm project is
`964c6064-e4e3-4713-b66e-f3ec9b41f718` and its OIDC role is
`babbage-device-lab-tpnil-ci`. Both federations accept this repository's main
branch only. Runtime credentials remain outside source and retained reports.

The manual `Shared device identity` workflow exchanges both federated identities,
reads the tenant's device project, checks cross-tenant denial and reads the
shared reservation ledger. It creates no device lease. Its output is
`INFRASTRUCTURE_IDENTITY_ONLY`, with the source revision and Actions run ID.

The version 1 broker accepts an explicitly pinned device profile and returns a
lease ID, tenant, provider resource, deadline and ADB serial or Appium endpoint.
The endpoint remains private. A release receipt identifies the terminal provider
state and observation time; subsequent clean-allocation checks establish reset
separately. ProofRun customer roles do not substitute for laboratory assertions.

Physical Google streaming does not provide ADB reverse forwarding, a custom
system image or the controlled local network required by existing ISI-4 wallet
plans. Those plans retain the owned KVM lane until disposable GCE capacity is
qualified with the same immutable fixtures and service boundaries. Physical
installation observations are infrastructure evidence; the pending conformance
coverage remains recorded in [implementation status](implementation-status.md).

Provider configuration, encrypted operator recovery credentials, the atomic
USD75 feasibility envelope and cleanup service are maintained in network-ops:
`config/shared-device-lab.json`, `config/shared-device-profiles.json`, and
`scripts/shared-device-lab/`. The initial envelope is a feasibility limit, not
a commercial subscription or completion of the full qualification matrix.
