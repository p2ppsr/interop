# Laboratory infrastructure

TPNIL uses one versioned execution protocol across local terminals, independent laboratories, and CI schedulers. GitHub Actions may request and display a run; it does not define the environment, hold the only evidence copy, or determine the result.

## Execution layers

1. **Control and evidence.** The repository validates the run plan, identifies every artifact, evaluates observations, writes content-addressed evidence, and verifies a retained bundle without network access.
2. **Portable service plane.** Application origins and controlled services run from pinned artifacts and OCI image digests. A profile can use a single host for development or equivalent isolated capacity under another scheduler. Docker Compose is the baseline topology format; Kubernetes is an optional capacity implementation.
3. **Native execution.** Desktop operating systems run in disposable virtual machines restored from a qualified base. Mobile applications run on declared simulators or physical devices as the artifact and vector require. Native guests have no repository or archive credential.
4. **Scheduling.** A local operator or GitHub Actions allocates the same profile and invokes the same controller. Official native jobs use single-job, ephemeral self-hosted runners or a broker that holds no SUT state between jobs.

## Reproduction contract

Every runnable profile identifies the controller revision, SUT digests, base image or device identity, operating-system and browser versions, dependency digests, logical origins, network policy, initial state, reset procedure, automation version, oracles, evidence destinations, and permitted semantic variation. Preparation-time acquisition is separate from run-time dependency closure.

The repository contains all TPNIL-owned provisioning and evaluation logic. Operators obtain third-party operating systems and proprietary SUTs through lawful channels and verify them against the declared digests. No independent operator requires access to P2PPSR infrastructure or credentials.

## First lanes

- `portable-webroot-1`: extracts and serves a submitted web-root artifact on loopback under its declared logical origin, checks the manifest and static dependency closure, repeats selected observations, and retains all response bodies with the artifact in an offline-verifiable bundle.
- `github-macos-arm64-1`: uses a clean GitHub-hosted Apple-silicon macOS virtual machine for native artifact admission and bridge qualification. The run records the observed hosted-image version because GitHub updates this capacity over time. Workflow artifacts are transferred into the repository-owned evidence format before their retention period expires.
- `macos-arm64-tart-1`: runs an unchanged production macOS wallet in a disposable Apple Virtualization guest. The base guest is pinned by registry digest, cloned for each run, and destroyed after evidence collection. Its network is restricted to the host service plane and explicitly declared acquisition endpoints during preparation.

The portable lane qualifies the controller, archive, application artifact, and service-origin mechanics. The hosted macOS lane qualifies installation, ordinary first-use setup, renderer automation, local bridge observation, evidence capture, and teardown. Both produce `INFRASTRUCTURE_QUALIFICATION_ONLY`, never a SUT conformance verdict. The Tart lane remains the stable independent reconstruction target and must complete routing and reset qualification before scored native vectors run there.

## Commands

```sh
node bin/tpnil.mjs run-qualification \
  infra/plans/todo-webroot-qualification.json . out/todo-webroot-run local-operator
node bin/tpnil.mjs verify-qualification out/todo-webroot-run

node bin/tpnil.mjs archive-native-qualification \
  infra/plans/bsv-desktop-native-qualification.json downloaded-evidence out/native-run
node bin/tpnil.mjs verify-native-qualification out/native-run
```

The resulting directories are portable evidence bundles. `record.json` binds the plan, observations, result, and raw evidence stored by SHA-256 under `objects/`. Portable web-root bundles retain the application artifact. Native bundles retain the release digest, size, publisher signature evidence, and all run observations; the large release artifact remains in the separately controlled artifact archive.
