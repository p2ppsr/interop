# Mediated storage interoperability profile

Version **1.0.0**, status **EXPERIMENTAL**. This prospective profile leaves the
0.1.0 catalog and every earlier native-wallet record unchanged.

`node scripts/prepare-storage-sync-go.mjs` builds the separately identified Go
compatibility participant. `node scripts/run-storage-sync.mjs OUTPUT` executes
all four TypeScript/Go source/destination cells twice. The wallet, source and
destination use authenticated public HTTP APIs. WalletStorageManager drives
`getSyncChunk`, `processSyncChunk` and `setActive`; no database copying occurs.
Each repetition uses fresh identities in disposable storage, reusing only public
fixture keys and the admitted Teranode-mined funding bytes.

The dataset contains that mined transaction and proof, an actual signed encrypted
PushDrop task, transaction labels, output tags, basket policy, spending links,
and a signed certificate with two encrypted fields. The independent reader
projects natural entity identities and resolves every foreign key. It retains
metadata, transaction/proof/script bytes, status and spendability. Shared raw
transaction bytes may occur in transaction, proven transaction or request rows;
the oracle verifies their hashes and agreement before deriving script offsets.
Empty optional byte arrays, zero rebroadcast count, boolean 0/1 encodings and JSON
object key order have explicit equivalent representations. Missing bytes,
contradictory offsets, dangling keys and duplicate logical identities fail.

Required observations are: full initial logical equality; one committed sync
reply lost before destination restart; resume from persisted checkpoints; replay
idempotence; isolated output and sync reads; incremental certificate tombstone;
active-provider substitution; a fresh-client task reconstruction; a new signed
post-substitution action; and clean teardown. The complete fixture is bounded to
1,000 records per page. Reauthentication after restart has at most three attempts;
all errors remain in the transcript. Every attempted outcome is retained.

The TypeScript participant is `@bsv/wallet-toolbox@2.13.0`. The Go participant is
`go-wallet-toolbox@v0.191.4` plus the exact source patch in
[`infra/adapters/storage-sync`](../../../../infra/adapters/storage-sync/).
The patch preserves zero-valued basket policy, output `providedBy`, and translated
notification transaction IDs. Joined execution additionally requires stable
requested-output response order with randomized `vout` values and certificate
keyrings taken from the stored encrypted master keys instead of field ciphertext.
Both defects were reproduced through actual wallet operations before correction;
the patch includes upstream-package regression assertions for them. The wire adapter reconciles the upstream Go
`proveTxId` spelling and TypeScript SQLite boolean encodings. Both unmodified
wire records and the corresponding canonical request/response are retained.
The patched binary has its own digest/manifest and is rejected by historical
ITCVE-1 1.2.0 native admission. It is not relabelled as the unchanged Go release.
Only the separate, explicit ITCVE-1 1.3.0 native profile admits the pinned patch.

`node scripts/verify-storage-sync.mjs OUTPUT` independently recomputes all eight
cells from the retained raw initial, replay and incremental datasets, verifies
the mined funding proof against the pinned fixture, and checks authenticated
denial, fresh outpoints, replacement writes and cleanup. It also mutates retained
metadata and proof bytes in disposable copies, rebinds their evidence digests,
and requires the semantic oracle to reject both corruptions.

Results qualify this controlled storage integration. They do not establish a
native wallet's storage configuration/replacement UI or full ISI-3 V004/V006
coverage. Those require the full status/method inventory and an admitted wallet
adapter. V007 native claims require the same production wallet to replace its
provider through its supported interface; exported keys and a new reference
wallet cannot substitute for that operation.
