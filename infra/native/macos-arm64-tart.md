# macOS ARM64 local reconstruction lane

`macos-arm64-tart-1` is the stable, independently operated counterpart to the ephemeral hosted macOS lane. It uses Apple Virtualization through Tart and creates a new copy-on-write guest for every run. The machine-readable profile pins the runtime, upstream base digest, resources, and isolation settings.

## Host admission

The host must be an Apple-silicon Mac with sufficient capacity for the pinned base, one disposable clone, retained evidence, 8 virtual CPUs, and 16 GiB guest memory. Tart 2.37.0 must match the archive and executable digests in the profile and pass macOS code-signature and notarization assessment. An operator may install it anywhere on `PATH`; the laboratory does not depend on Homebrew.

Acquire the base once:

```sh
TPNIL_TART_PULL_CONCURRENCY=4 scripts/native/tart-prepare-base.sh
```

The script pulls by OCI digest, disables automatic deletion of other virtual machines, and refuses a different Tart version. Acquisition requires network access. The acquired base is not a test result; record its local Tart configuration and qualify it before use.

## Run lifecycle

Create an isolated clone whose name begins with `tpnil-run-`:

```sh
scripts/native/tart-create-run.sh tpnil-run-20260920-a
```

Stage the exact release artifact, qualification plan, and driver in a dedicated host directory. Mount that directory read-only and start with host-only networking:

```sh
tart run --no-graphics --no-audio --no-clipboard --net-host \
  --dir=inputs:/absolute/path/to/run-inputs:ro \
  tpnil-run-20260920-a
```

The host service plane supplies declared application, transaction, proof, header, and storage endpoints. Acquisition occurs before this phase. A profile that requires a temporary external destination must declare it and use an explicit Softnet allowlist instead of unrestricted NAT. Repository, GitHub, and evidence-archive credentials never enter the guest.

Use `tart exec` through the guest agent to inspect the guest identity, stage commands, and retrieve evidence to a separate writable evidence share. Native UI control uses the same CDP driver as the hosted lane. Browser-visible certificate trust follows the application and operating system's normal trust path; the driver does not disable TLS validation.

After evidence has been copied, hashed, and verified, destroy only the named disposable clone:

```sh
scripts/native/tart-delete-run.sh tpnil-run-20260920-a
```

Never reuse a run clone. A repeated run begins from another clone of the qualified base with a randomized MAC address and serial number.

## Qualification gate

Before scored vectors, the local lane must record two clean native qualifications, prove clone reset, confirm the guest OS and runner configuration, exercise host-only routing, demonstrate evidence export, and verify teardown. Controlled-service qualification additionally requires destination coverage for every process used by the selected vectors. The hosted lane can continue to provide independent scheduling and comparison, but it does not replace this stable reconstruction point.
