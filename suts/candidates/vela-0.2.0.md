# Vela 0.2.0 vendor candidate

Status: **vendor-submitted candidate**.

Vela is a BRC-100 wallet that runs as a local service in a single OCI image. The wallet answers the
BRC-100 HTTP interface on port 3321, and a dashboard on port 3400 manages app access, spending budgets,
setup and PeerPay payments in both directions. Wallet records are kept on a remote BRC-100 storage server
(`@bsv/wallet-toolbox` StorageServer) named by configuration; the image contains no database. The
publisher describes Vela as an experimental wallet built for learning rather than as a consumer product.

Bridget Doran submitted the image and accepted the [vendor submission terms](../../legal/ARTIFACT-SUBMISSION-AGREEMENT.md)
version 2.2.0 in the pull request that added this record. The submission is the built image only;
the source repository is not public. Vendor documentation is in
[vela-0.2.0-README.md](vela-0.2.0-README.md).

0.2.0 follows [Vela 0.1.0](vela-0.1.0.md). It adds PeerPay receive, the known limitation recorded for
0.1.0, and PeerPay send. The publisher suggests technical intake start from 0.2.0.

## Artifact

| Field | Value |
| --- | --- |
| Image | `ghcr.io/hbgnostic/vela-wallet:0.2.0-0b7da0a` (public) |
| Image index | `sha256:66ca84c6c8a87a898e6ac3ebf12f44aeedc4f43b8825030cd56ed52b8990bc06` |
| linux/amd64 manifest | `sha256:cfb5d5a66b32a71d3b560fac09643c9b7641b0bb92b19c654e654c670662fa5e` |
| linux/arm64 manifest | `sha256:facc172f16c5e7c9d7af26bca88a833dd64c817f509a7f8125e4f51de04de351` |
| Wallet libraries | `@bsv/sdk` 4.0.1, `@bsv/wallet-toolbox` 2.15.1, `@bsv/message-box-client` 2.7.0 |
| Base image | `node:22-slim` (Debian) |

The image index also lists two attestation manifests (platform `unknown/unknown`); they are not images.

The dependency set is unchanged from 0.1.0: 298 npm packages, 286 under permissive licenses (MIT, ISC,
BSD-2-Clause, BSD-3-Clause, Apache-2.0, BlueOak-1.0.0) and 12 under the Open BSV License (`@bsv/*`
packages under version 6, `@bopen-io/templates` under version 4). `@bsv/message-box-client` was already
bundled in 0.1.0 as a dependency of another package; 0.2.0 declares it directly at the same version.
Debian base-image packages carry their own licenses.

## Changes from 0.1.0

- **PeerPay receive.** A Post Offices panel in the dashboard lists PeerPay payments waiting for the
  wallet's main identity at MessageBox hosts, and **Accept** takes one into the wallet.
- **PeerPay send.** The same panel pays another identity key and leaves the note at the host the
  recipient advertises, or at a known host the user picks when the recipient advertises none.
- **`VELA_MESSAGEBOX_HOSTS`** (optional) names extra MessageBox hosts to check.
- **Fee display.** With remote storage the dashboard showed a fee model of 1 sat/kB; it now shows
  100 sat/kB, marked as set by the storage server. Display only: the fee was always the storage
  server's.
- **Dashboard forms** clear after a successful action.
- **App Access** accepts a bare site name (`zanaadu.com`, `localhost:8088`) and stores it as a web
  origin (`https://zanaadu.com`, `http://localhost:8088`), as spending authorizations already did.
- **App Activity and Transaction History** show the newest 10 rows, with a button to show the rest.
- **Waiting for proof.** The pending panel is renamed, explains that the storage server records proofs,
  and drops the Age and Attempts columns, which were always empty with remote storage.
- **No local Monitor with remote storage.** 0.1.0 started the wallet toolbox Monitor against the
  remote store, where it failed at once (`WERR_INVALID_OPERATION`) and logged a stack trace on every
  start. It did no work there; proofs are recorded by the storage server's Monitor.
- **Block Headers Service compatibility** (only when `BLOCK_HEADERS_URL` is set). Wallet toolbox 2.15
  rejects two Block Headers Service responses: `chainWork` sent in decimal, and stale fork headers
  returned alongside the longest-chain header at a forked height. Vela's client drops a non-hex
  `chainWork` and keeps only the longest-chain header.

## Configuration and initialization

| Setting | Purpose |
| --- | --- |
| `WALLET_STORAGE_URL` | Required. The BRC-100 storage server. Vela refuses to start without it and has no local-storage fallback. |
| `VELA_DASHBOARD_KEY` | Required. Gates the dashboard and setup page (`?key=` or `x-api-key`). |
| `WALLET_SEED` | Optional. A 64-hex seed; when set, setup is skipped for unattended runs. |
| `CHAIN` | `main` (default) or `test`. |
| `VELA_MESSAGEBOX_HOSTS` | Optional. Extra MessageBox hosts to check for PeerPay payments, comma-separated, each `https://…` or `Label=https://…`. |

Initialization is unchanged from 0.1.0: without `WALLET_SEED`, the setup page on port 3400 creates a
wallet (a 24-word recovery phrase from 32 bytes of entropy) or restores one from 24 words or a 64-hex
seed. The seed is stored encrypted in the `/data` volume (scrypt, AES-256-GCM) and unlocked by password
at each start. The root key is `HMAC-SHA256(seed, "IDENTITY_KEY_V1")`.

## PeerPay receive

Checking is read-only. Vela looks up the MessageBox host advertised for its identity key, then lists the
`payment_inbox` at that host, at any host in `VELA_MESSAGEBOX_HOSTS`, and at four public defaults:
`messagebox.babbage.systems`, `messagebox.bsvblockchain.tech`, `messagebox.1sat.app` and
`message-box-us-1.bsvb.tech` (the `@bsv/message-box-client` default). It does not advertise a host.

Accepting a payment:

1. Fetches the message again from its host and keeps a copy in the `/data` volume.
2. Derives the BRC-29 key from the message's derivation prefix and suffix and the sender's identity
   key, and refuses unless an output of the payment's transaction pays exactly that key.
3. Calls `internalizeAction` with that output and its payment remittance.
4. Acknowledges the message at its host only after the payment is internalized.

Accept only takes messages from hosts Vela checks. It covers the main identity, not per-app identities.
An automated driver can use the same path:

| Endpoint | Body | Effect |
| --- | --- | --- |
| `GET /api/peerpay?fresh=1` | | Lists waiting payments per host, and the advertised host |
| `POST /api/peerpay/accept` | `{"messageId":"…","host":"https://…"}` | Accepts one payment |
| `GET /api/peerpay/route?to=<identity key>` | | The recipient's advertised host, if any, and the fallback host |
| `POST /api/peerpay/send` | `{"recipient":"02…","amount":1000,"host":"https://…"}` | Pays the recipient and leaves the note at `host` |

Sending looks up the recipient's advertised host. If there is none, the dashboard offers the hosts Vela
checks, with the first `VELA_MESSAGEBOX_HOSTS` entry or the library default preselected, and says the
recipient's wallet may not check the one chosen. The send endpoint accepts only the recipient's
advertised host or a host Vela checks. It pays from the main identity through `PeerPayClient.sendPayment`.

## Permissions

Unchanged from 0.1.0. Vela shows no permission prompts; every app request is evaluated against rules
set in advance:

- An app connects only after its exact web origin is added under App Access; other origins receive
  no CORS grant and are recorded as blocked.
- An app spends only within a monthly BRC-73 spending authorization; other spends are refused.
- Signing requests under the protocols that lock the wallet's coins (BRC-29 payments and 1Sat
  ordinals) are refused unless the origin is on the spend allowlist (`WALLET_SUBSTRATE_ORIGINS`,
  empty by default); a spending authorization does not enable them.
- The `default` basket and admin-reserved baskets and labels are not readable by apps.

Each request, allowed or refused, is recorded in the dashboard's App Activity log with its shape and
outcome, without payload values. Driver endpoints, authenticated with `x-api-key`:

| Endpoint | Body | Effect |
| --- | --- | --- |
| `POST /api/access/add` | `{"origin":"https://app.example"}` | Allows an origin to connect |
| `POST /api/access/remove` | `{"origin":"https://app.example"}` | Removes it |
| `POST /api/permissions/grant` | `{"origin":"https://app.example","monthlyBudgetSats":10000}` | Grants or updates a monthly budget |
| `GET /api/permissions` | | Lists budgets and spending this month |

## Publisher observations

The publisher ran the submitted image, pulled from the registry by its index digest, on Linux (amd64)
with an existing wallet on a pricing BRC-100 storage server. The startup log had no errors.

- **Receive.** Another wallet sent 500 satoshis by PeerPay with the note at
  `message-box-us-1.bsvb.tech` (transaction `a196617b6cb9f5baec770790ccd2d94cdfc15266004d1208c74f2c3d4a879a25`).
  It appeared in the Post Offices panel and was accepted; afterwards no payment was listed at any
  checked host.
- **Send.** Vela sent 500 satoshis by PeerPay to an identity that advertises no host
  (transaction `0cc5a6038da67e5d0f6e2683238abe39ee7d9b5eb55b987a1a017e48a2304412`). The dashboard
  offered the hosts Vela checks; `message-box-us-1.bsvb.tech` was chosen. The recipient's wallet
  found the message there and derived the key for the 500-satoshi output.

The same image digest was then run on macOS (arm64, Docker Desktop) with the same wallet restored.
Another wallet sent 500 satoshis by PeerPay to `message-box-us-1.bsvb.tech` (transaction
`ebae4b082c27d2b6d84112ee3b1b68ea6a5eb3ff1d101bbcb29968088190b3a9`); it appeared in the Post Offices
panel, was accepted, and raised the balance from 6,590 to 7,090 satoshis.

Earlier the same day, build `0.2.0-a7161aa` (one commit before this release, without the Monitor
change) sent 500 satoshis the same way. Before that, build `0.1.0-43a677c` (this release's PeerPay receive code,
before the fee-display change, README and version bump) accepted a 1,000-satoshi payment. That build
also listed all checked hosts for a second identity with no payments waiting, and refused accept
requests for an unchecked host, a missing message and an unauthenticated request.

These are vendor observations, not laboratory results.

## Known limitations

- MessageBox has no way to find a recipient who hasn't advertised a host: the sender's wallet uses
  its own default. Vela checks the common defaults but doesn't advertise a host, so a payment left at
  a host it doesn't check isn't seen. The same gap applies when Vela sends to a recipient with no
  advertised host.
- PeerPay send and receive cover the main identity only, not per-app identities.
- The App Access list and per-app identity choices are kept in the local `/data` volume and do not
  follow the wallet to another machine; budgets do.
- The 24 words restore the wallet in Vela. Other wallets derive keys differently, so the same words
  would open an unrelated, empty wallet there.
- Receiving ordinals, BSV-21 tokens, or plain BSV sent to an address fetches the transaction and its
  proof from WhatsOnChain, because a payment to an address arrives without one. Payments that arrive
  as BEEF (wallet-to-wallet and PeerPay) don't.
- Proofs for a remote-storage wallet are recorded by the storage server's Monitor. A storage server
  that doesn't run one leaves transactions waiting for proof.

## Admission

Not admitted. Candidate registration verifies registry metadata and retains submission acceptance.
The [production SUT intake process](../../docs/intake.md) still requires artifact layers, dependency
and permission review, service boundaries, isolated initial state, observation coverage, clean reset
and repeated runtime evidence. The generic HTTP driver is an engineering tool; it does not establish
an admitted OCI lane or implement Vela's app-access and budget lifecycle. No Vela laboratory result
has been recorded.
