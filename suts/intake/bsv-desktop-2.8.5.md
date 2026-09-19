# BSV Desktop 2.8.5 intake

Profile: ISI-4 1.0.0 / ITCVE-1 1.0.0, production wallet with explicitly configured controlled services. Status: **BLOCKED for native vector execution**.

## Artifact

The downloaded macOS arm64 DMG is 197,754,121 bytes with SHA-256 `05dec27dc461d4a9fbbe9aafdec53bdb6e947b46c0d1652e16342da47471d12e`, matching [release metadata](../../docs/research/intake-2026-09-18/release.json). The bundle identifies version 2.8.5 and `com.bsvblockchain.bsvdesktop`.

Read-only mounting and static signature verification succeeded. The [signature inspection](../../docs/research/intake-2026-09-18/signature-inspection.json) records Developer ID Application: BSV Association, TeamIdentifier `SV8SWTHA2H`, and a stapled notarization ticket. These observations establish static integrity; the application was not installed or launched. The image was detached after inspection.

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

1. An isolated native runner with ordinary installation and UI automation.
2. Runtime confirmation that required service boundaries are explicitly configurable and observable, or a narrower declared vector scope for any unresolved boundary.
3. A pinned controlled-service closure and independently validated mainnet-format funding, header, proof, and storage fixtures.
4. Native application driving and independent V001–V004 oracles, followed by two clean repetitions.
5. Artifact and dependency retention terms for admitted reporting.

[The machine-readable intake](bsv-desktop-2.8.5.json) records each criterion and evidence digest. The review command verifies those records and the actual DMG. No ToDo vector, wallet conformance result, or public-mainnet transaction is recorded by this intake.
