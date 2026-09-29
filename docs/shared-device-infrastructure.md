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
USD450 cumulative qualification envelope (USD400devices/USD50other) and cleanup service are maintained in network-ops:
`config/shared-device-lab.json`, `config/shared-device-profiles.json`, and
`scripts/shared-device-lab/`. The envelope includes all prior gross reservations and has no automatic renewal.
It is a qualification limit, not a commercial subscription or completion of the
full qualification matrix.


The manual `Shared physical Android qualification` workflow retrieves an exact
network-ops runtime generation and frozen laboratory APK, validates their SHA256,
and uses the tenant's short-lived Google identity. It verifies device identity,
prior package/marker absence, installation, process launch, screenshot collection
and provider termination. This result is INFRASTRUCTURE_QUALIFICATION_ONLY;
it does not execute the ISI-4 controlled-service vectors or issue a SUT verdict.
Raw provider endpoints and private transport descriptors are excluded from Actions
artifacts. The shared atomic cost reservation and provider TTL govern each run.

The disposable GCE lane has executed KVM API12 and the repository's 47 core tests,
catalog check, packaging command and LAB_SELF_TEST_ONLY demo through IAP, with
VM and boot-disk deletion verified. Controlled GCE replay `lab-2db91794-84ef-4a13-b2c0-135340d6bb0c` now retains
the transaction boundary after controller shutdown. Independent verification
confirms four accepted submissions, funding ancestry, UMP registration and a
seven-satoshi ToDo output. The frozen1.1.10 app's final UI assertion still fails;
its diagnostic boundary is verified, but customer completion is not.

Fresh hosted Mac runs36510559954 and36510756890 each passed all13native
BSV Desktop baseline assertions and offline verification. Distinct CI jobs do
not establish physical-host independence or the pinned Tart reconstruction.
The two-clean-small-pack and full G2 matrices remain acceptance gates. Operational source and complete attempt
history remain in network-ops.
