# SQLite snapshot conflict recovery

This prospective layer follows the immutable `storage-input-ancestry` patch.
It retains the same host, SQLite database, control routes, and service lifecycle.

The existing SQLite driver already enables WAL and a 5,000 ms busy timeout.
A deferred transaction that reads before a concurrent connection commits cannot
upgrade its stale snapshot to a writer. SQLite returns the typed
`SQLITE_BUSY_SNAPSHOT` (extended code 517); waiting within that transaction does
not repair the snapshot. [SQLite's isolation documentation](https://www.sqlite.org/isolation.html)
requires ending the stale transaction before starting another.

The patch extends the existing transaction-owner retry classifier to precisely
that typed error. GORM rolls back before the owner retries the entire database
transaction. The existing maximum of three attempts, jitter, cancellation, and
no-retry policy for nested repositories remain. Plain `SQLITE_BUSY`, recovery
busy, locked, constraint, text-only and application errors are unchanged. It
does not retry a public wallet operation or repeat network side effects.

Tests use the actual configured SQLite driver and two pooled connections with
deterministic ordering. They prove fresh-state recovery, complete rollback,
bounded exhaustion, cancellation, nested no-retry, and no replay of committed
writes. Classifier tests retain all other error categories, including the
existing PostgreSQL tests.

The earlier full reference's generic `database is locked` API failure remains
retained. That capture did not preserve an extended SQLite code or server log;
its exact cause is unknown. This fix closes the separately reproduced typed
snapshot conflict and does not reclassify the earlier sample or claim native
qualification.

Prepare with `node scripts/prepare-storage-sqlite-retry-go.mjs`. The manifest
schema is `tpnil-storage-sqlite-retry-go-build@1.0.0`; use the explicit
`storageSQLiteRetryPatch` selector. Every ancestor, source input, generated host
file, and final binary is hash-bound. Earlier layers remain available for exact
historical replay.
