# BSV Desktop 2.8.5 intake

Profile: ISI-4 1.0.0 / ITCVE-1 1.0.0, production wallet with explicitly configured controlled services. Status: **native baseline qualified; blocked for controlled-service vectors**.

## Artifact

The downloaded macOS arm64 DMG is 197,754,121 bytes with SHA-256 `05dec27dc461d4a9fbbe9aafdec53bdb6e947b46c0d1652e16342da47471d12e`, matching [release metadata](../../docs/research/intake-2026-09-18/release.json). The bundle identifies version 2.8.5 and `com.bsvblockchain.bsvdesktop`.

Read-only mounting and static signature verification succeeded. The [signature inspection](../../docs/research/intake-2026-09-18/signature-inspection.json) records Developer ID Application: BSV Association, TeamIdentifier `SV8SWTHA2H`, and a stapled notarization ticket. Subsequent native qualification installed the same digest on clean macOS virtual machines. Two runs passed Gatekeeper, first-use initialization with an isolated unfunded fixture, ordinary certificate trust, mainnet-mode reporting, authentication, and local BRC-100 bridge inspection. The retained records are [run 35533034148](../../journals/native-qualification/2026-09-20/bsv-desktop-2.8.5-macos-arm64-35533034148/record.json) and [run 35533139040](../../journals/native-qualification/2026-09-20/bsv-desktop-2.8.5-macos-arm64-35533139040/record.json).

## Supported configuration inventory

The [source observation record](../../docs/research/intake-2026-09-18/source-observations.json) pins the v2.8.5 tag to commit `cb0350d5472bf33bb8e599e6599f922324306e5e` and hashes each inspected file. Source-tag association is separate from a reproducible source-to-binary proof.

| Boundary | Source observation | Required native evidence |
| --- | --- | --- |
| Network selection | Mainnet is the default and an ordinary configuration choice | Installed wallet reports the selected network |
| Remote storage | Ordinary UI accepts a storage URL | Actual requests reach the explicit ITCVE endpoint with expected authentication and state |
| Local storage | SQLite state resides under the OS user's home directory | Clean guest state, independent data directory, reset, and complete teardown |
| Renderer services | Factory creates default services and selects ChainTracks from chain-specific constants | Destination and response coverage for operations used by the vectors |
| Storage services | Backend constructs its own services and ChainTracks client | Independent routing evidence for local-storage mode |
| Monitor services | Worker constructs a separate service instance | Background request inventory and state transitions |
| HTTP proxy | Ordinary network setting routes supported traffic and can require restart | Per-process route coverage; destination TLS remains intact |
| WAB/message box | Ordinary configuration exposes URLs | Applicability and runtime coverage if selected for the experiment |

Remote storage is the most direct supported candidate integration path. Its configuration does not replace the renderer's service clients. Proxy support likewise does not establish response control for encrypted connections. The required header, proof, and transaction paths remain subject to installed-binary qualification.

## Execution prerequisites

1. Runtime confirmation that required service boundaries are explicitly configurable and observable, or a narrower declared vector scope for any unresolved boundary.
2. A pinned controlled-service closure and independently validated mainnet-format funding, header, proof, and storage fixtures.
3. Independent V001–V004 application and transaction oracles, followed by two clean vector repetitions.
4. Artifact and dependency retention terms for admitted reporting.

[The machine-readable intake](bsv-desktop-2.8.5.json) records each criterion and evidence digest. The review command verifies those records and the actual DMG. No ToDo vector, wallet conformance result, or public-mainnet transaction is recorded by this intake.

Native baseline qualification is admitted under [ISI-4 decision 0004](../../programs/ISI-4/decisions/0004-native-qualification-lanes.md). The retained intake record remains unchanged because it describes the evidence available at that review; a later intake review will incorporate the native records after service-boundary evidence is complete.
