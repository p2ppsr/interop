# Message Box and recipient discovery integration

The messaging lane runs the maintained TypeScript Message Box implementation,
Go Message Box implementation, authenticated clients and MessageBox discovery
plugins at the identities in
[`sources.lock.json`](../components/messaging/sources.lock.json).
The frozen assertions are in
[`profile.json`](../components/messaging/profile.json).

```sh
node scripts/prepare-messaging.mjs
node scripts/run-messaging.mjs --out out/messaging-run-1
node scripts/verify-messaging.mjs out/messaging-run-1
```

The services integration package and synthesis dependencies must be installed
first. The preparation command verifies source archives, performs locked npm
installs, verifies Go modules and builds the Go host. The execution command
rejects a changed source tree, adapter or binary. Each attempt uses a new output
directory; an existing result cannot be overwritten. Local execution uses the
pinned disposable Mongo container in `components/messaging/mongo.mjs`.
`TPNIL_GO_MONGO_URI` selects an explicitly supplied isolated Mongo replica set
whose lifecycle remains with its caller. No FCM credentials or public-mainnet
services are required.

The matrix uses real mutual HTTP authentication, encrypted messages, independent
identities, permissions, fees, duplicate detection, signed-request replay,
server restart and acknowledgment. Real Toolbox wallets create recipient fee
payments from the retained Teranode-mined fixture. The receiver's action store
and an offline transaction verifier establish that the exact payment was
internalized. The verifier checks input scripts, mined ancestry, the fixed
23-satoshi recipient output and value conservation.

A signed, funded advertisement is submitted through actual OverlayExpress to
`tm_messagebox`, stored by the actual Mongo lookup plugin and synchronized to a
second engine using GASP. A client resolves the advertised recipient and delivers
an encrypted message to that service. Discovery persists through restart, and
an independently verified signed spend removes the advertisement. Automatic
public peer discovery is disabled; the two admitted peers are explicitly wired.

The TypeScript transport exercises actual authenticated WebSockets. Both Go lanes
also exercise the recipient-side authenticated HTTP polling adapter. This adapter retains
recipient wallet authority at the client, bounds remembered message IDs, waits
for callbacks and stops its timer and in-flight operation during teardown. It
does not establish native Go WebSocket or mobile push support.

## Go compatibility closure

The unchanged Go source remains a separate matrix participant. Executions expose
three failed assertions: the Go `[]byte` JSON representation prevents the current
TypeScript client from internalizing recipient payments, the same payment can
fund a second message, and acknowledgment/restart does not prevent that reuse.
These observations remain laboratory data.

The explicitly identified `go-adapted` closure adds two narrow data changes in
[`go-host.go`](../components/messaging/go-host.go):

- Payment bytes are encoded as BRC-100 JSON numeric arrays before the Go
  authentication middleware signs the response. Client signature verification
  remains enabled.
- A SQLite trigger records each payment's actual transaction ID and recipient
  in the same atomic insertion as the upstream message. The persistent unique
  claim survives message acknowledgment and restart. A failed message insertion
  rolls back its claim. Distinct BEEF encodings cannot evade the transaction ID
  key, and a multi-recipient payment can still create one claim per recipient.

The same closure exposes actual maintained TypeScript AuthSocket through
[`go-websocket.mjs`](../components/messaging/go-websocket.mjs). Its HTTP frontend
forwards authenticated requests to the actual Go handlers. The socket uses the
same server identity, and its cryptographically verified client identity selects
read-only rows from Go's SQLite store. The bridge receives no recipient keys or
delegated HTTP credentials. Writes, permissions, payment processing and
acknowledgments remain with Go HTTP. Fee-bearing message receipt uses the client's
HTTP path so payment internalization precedes acknowledgment, matching the
TypeScript service's contract.

Push uses bounded 32-row scans and connection/room/delivery limits. Scans wrap to
avoid starvation after insertion or deletion, and only one scan runs at a time.
A disconnected client receives unacknowledged messages again; messages are
deduplicated within each connection. The real client tests cross-owner room
rejection, encrypted push, 34 queued messages spanning pages, reconnect, complete
service restart and acknowledgment durability. This closes the lab's push
contract with an explicit adapter; the pinned Go source still has no native
WebSocket implementation. No mobile FCM claim is made.

The adapter is scoped to SQLite and recipient fee delivery. The baseline server
wallet supports authentication; the fee-bearing output belongs to the recipient
and is internalized by its real configured wallet. Production database variants,
server delivery fees, optional FCM and native phone/camera behavior retain their
own admission requirements.

The discovery plugin's historical SDK 2.0.13 dependency has a reversed coinbase
maturity check. The plugin's declared source/dependency closure remains intact;
the maintained SDK 4.0.1 independently verifies transaction ancestry and scripts,
as does the actual Overlay Engine. The laboratory does not change the funding
height to accommodate the older verifier.

## Embedding

`startTypeScriptMessageBox` accepts an actual `wallet` dependency and returns an
origin, authenticated identity and close function. `startGoMessageBox` accepts
the prepared binary, isolated SQLite filename, laboratory key and the explicit
compatibility selection. Compatibility mode enables the socket bridge and
requires `typescriptSource` from the prepared source paths. `origin` identifies
the joined HTTP/socket frontend; `upstreamOrigin` identifies Go's HTTP server.
`websockets: false` selects the independently exercised HTTP/polling path.
`startMessageBoxDiscovery` registers the actual plugins
in the common OverlayExpress factory and exposes `resolve(identityKey)`.
These factories share the same implementations as the standalone matrix.

The protocol matrix is infrastructure evidence. Native wallet qualification uses
the unchanged admitted application and its public wallet interface; this matrix
alone does not establish that application or a physical device result.

`runNativeMessaging(wallet, services, output)` dispatches every payer operation to
the enclosing native wallet boundary. It returns six required assertions, exact
payment BEEF/raw transactions, recipient receipts, restart/replay exchanges and
cleanup evidence. `node scripts/verify-native-messaging.mjs DIR` independently
verifies the transactions, recipient derivation, ciphertext, advertisement
signature and evidence bindings. It accepts either the helper output directory
or the native envelope's flattened `messaging.json` and `messaging-*.json` files.
The native application's admission and provenance still come from that envelope.

Retained implementation attempts and final reference-wallet engineering runs are
indexed in `journals/messaging-integration/2026-11-06/index.json`. Earlier failures
remain unchanged; later passing samples do not replace them.
