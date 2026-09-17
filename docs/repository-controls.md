# Repository controls

Status: 2026-09-17 UTC.

`p2ppsr/interop` is private, with `main` as its default branch. Public release requires a recorded decision by the authorized steward under GOVERNANCE.md.

The `offline-core` GitHub Actions job runs on pushes and pull requests. It uses read-only repository permissions, no persisted checkout credentials, pinned action commits, and a fixed Node version. Checks cover the core, catalogs, retained journals, web-root packaging, and append-only journal history.

Server-enforced branch protection is unavailable under the current private-repository account plan. Signed checkpoints, independent mirrors, and a second administrative custodian are also outstanding. These controls are prerequisites for official reporting under the [evidence policy](evidence.md).

Before official reporting, the steward shall establish supported branch protection, required checks, independent checkpoints, and tested archival recovery. The selected hosting arrangement must preserve private visibility until public release is authorized.
