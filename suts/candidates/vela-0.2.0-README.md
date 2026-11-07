<!-- Vendor documentation for Vela 0.2.0, submitted by Bridget Doran under the TPNIL vendor submission terms version 2.2.0 (legal/ARTIFACT-SUBMISSION-AGREEMENT.md). It is not an Apache-2.0 project contribution. Copy of the publisher README at vela-wallet commit 0b7da0a. -->

# Vela

Vela is a BRC-100 wallet that runs as a service on your own computer. Apps talk to it at
`http://localhost:3321`, the address BRC-100 apps look for, and you run it from its dashboard at
`http://localhost:3400`. Its records live on a BRC-100 storage server that you choose.

## What Vela is

Vela is my experimental wallet. I built it to learn how a BRC-100 wallet works, for my own use
rather than for other people, and I added the parts gradually so I could understand each one. I've
packaged it so that a lab, or a developer who wants to look at it, can start one with a 24-word
recovery phrase and a password and see how it behaves.

That's also why everything starts locked down. Nothing gets in until I let it in: I add each app by
hand and give it a monthly budget by hand. When an app asks for something I haven't allowed, Vela
refuses on the spot and records the refusal, so I can see exactly what each app tried to do. Most
wallets ask in a pop-up when an app wants something; Vela decides from rules set in the dashboard
ahead of time.

## Out of the box, everything is rejected

- **No app can connect.** Websites are refused until you add them under App Access.
- **No app can spend.** Spending needs a monthly budget, which you grant per app under App
  Spending Permissions. A spend over budget is refused.
- **No app can sign under the protocols that lock your coins**, unless you've put it on the spend
  allowlist (`WALLET_SUBSTRATE_ORIGINS`). A budget doesn't unlock this.
- **No app can list your balance or the wallet's own records.** The `default` basket (all your
  ordinary coins) and the `admin` baskets and labels (budgets and permission records) are
  wallet-only.
- **Programs on your own computer** that call Vela without a web origin (scripts, a payment-claim
  job) can connect, but the same limits apply, and they can't spend: spending always needs a budget
  for a named app.

## Install and first run

### 1. Install Docker

- **Mac:** install [Docker Desktop](https://www.docker.com/products/docker-desktop/) and open it
  once so it's running.
- **Linux:** install Docker from your distribution (`sudo pacman -S docker` on Arch,
  `sudo apt install docker.io` on Ubuntu), then let your user run it:

  ```sh
  sudo systemctl enable --now docker
  sudo usermod -aG docker $USER
  ```

  Log out and back in for the second command to take effect. Until then, run `newgrp docker` in
  each terminal you use.

### 2. Get the image

```sh
docker pull ghcr.io/hbgnostic/vela-wallet:latest
```

Docker picks the right version for your machine (Apple Silicon, Intel or AMD). The image is
public, so no login is needed.

### 3. Start Vela

On one line:

```sh
docker run -d --name vela --restart unless-stopped -p 127.0.0.1:3321:3321 -p 127.0.0.1:3400:3400 -v vela-data:/data -e WALLET_STORAGE_URL=https://<your storage server> -e VELA_DASHBOARD_KEY=<a password for the dashboard> ghcr.io/hbgnostic/vela-wallet:latest
```

Check the two `-p` options before pressing Enter. **3321 is the wallet**, the address apps look
for; **3400 is the dashboard**. With only 3400, the dashboard works but no app can find the wallet.
Keep `127.0.0.1:` in both: it publishes Vela to this computer only. Without it, other computers on
your network could reach the wallet.

`docker port vela` should then list both, 3321 and 3400.

Only one wallet can answer on port 3321 at a time, so run one Vela (or one other desktop wallet)
per computer.

### 4. Set up the wallet

Open `http://localhost:3400/?key=<your dashboard password>`. The first time, Vela offers two
choices:

- **Create a new wallet.** Vela shows a 24-word recovery phrase. Write it down; it's the only way
  to restore the wallet, and Vela won't show it again. Then choose a password.
- **Restore a wallet** from its 24 words, or from its 64-character hex seed.

The 24 words restore a wallet **in Vela**. Vela derives its root key from the seed in its own way
(HMAC-SHA256 of the seed with the label `IDENTITY_KEY_V1`), so another wallet given the same words
derives a different, empty identity.

Vela keeps the wallet's seed encrypted in its data volume (scrypt and AES-256-GCM, with a key
derived from your password). Each time Vela starts, it asks for the password before it does
anything else. Five wrong passwords in a row pause unlocking for a minute.

### Using Vela on more than one computer

Restore the wallet on each computer with the same 24 words. The wallet itself comes back, because
it lives on the storage server: coins, history, baskets, budgets, certificates, ordinals and tokens.
Four things are kept on each computer instead, in Vela's data volume, and start empty on a new one:

- **The list of allowed apps** (App Access). Add your apps again; their budgets are already there.
- **Per-app identity choices.** Until you choose again, every app sees your main identity on that
  computer, so an app you'd given a private identity would see a different you there.
- **The activity log.**
- **Watched ordinal addresses.**

### The storage server

A storage server keeps the wallet's records: coins, transactions, baskets, labels and
certificates. The storage server has its own database, which it sets up itself; Vela has none.

I keep my wallet's records on a storage server because I use the wallet from more than one place:
my desktop, and the server and scripts behind my own apps, with a laptop or another machine able to
join whenever I need. Each of them connects to the same storage server, so they all see the same
coins and the same history, and there is only ever one record of the wallet. A second copy kept on one device would drift from the real
one. A device needs only the wallet's key to connect, never a database password.
Point `WALLET_STORAGE_URL` at any server running the BRC-100 StorageServer from
`@bsv/wallet-toolbox`, whether one you run or a hosted one.

Some storage servers charge identities they don't know for each request. A brand-new wallet has
nothing to pay with yet, so the first connection can be refused. Vela says so on the setup page and
shows the wallet's identity key, so you can ask the server's operator to allow it, then press Try
again.

## Troubleshooting

| What you see | What it means |
| --- | --- |
| `permission denied while trying to connect to the Docker API` (Linux) | Your user isn't in the `docker` group yet in this terminal. Run `newgrp docker`, or log out and back in. |
| `The container name "/vela" is already in use` | An earlier container still exists. `docker rm -f vela` removes it; the wallet stays in the `vela-data` volume. |
| An app says the wallet didn't respond, and App Activity shows nothing from it | Port 3321 isn't published. `docker port vela` should list 3321; if it doesn't, remove the container and run it again with both `-p` options. |
| An app's requests show as **blocked** in App Activity | Working as intended: add the app under App Access, and give it a budget if it needs to spend. |
| The setup page says the storage server didn't accept this wallet | The storage server charges identities it doesn't know. Ask its operator to allow the identity key shown, then press Try again. |
| After a restart, Vela says it's locked | Expected: enter the wallet password. Vela never starts unlocked unless `WALLET_SEED` is set. |
| Claim says to wait | The payment isn't in a block yet. Claim needs the block's proof; try again in a few minutes. |
| Anything else | `docker logs vela` shows what Vela printed. |

## Receiving money

The dashboard's **Deposit** panel shows the wallet's deposit address. It's a BRC-29 address
derived from your identity key, so any wallet can send to it, and only yours can spend from it.
After someone pays it, press **Check for incoming**, then **Claim**. Claiming takes the payment into
the wallet without writing a new transaction, so there's no fee.

Claim is Vela's own receive path, built for this wallet rather than taken from the wallet library.
It fetches the payment from WhatsOnChain along with its merkle proof (the proof that it's in a
block), looks up that block's height from a block headers service, packages the payment and proof
as AtomicBEEF, and hands that to the standard BRC-100 `internalizeAction` to file it in the wallet.
Because it needs the proof, a payment can be claimed once it's in a block, usually within about ten
minutes. Until then, Check finds it and Claim says to wait.

The deposit address stays the same, so payments to it can be linked to each other by anyone
watching the chain. Apps that pay you through BRC-100 (BRC-29 payments with their own derivation)
use a fresh key each time instead.

Ordinals and BSV-21 tokens have their own receive address in the Ordinals panel. **Scan for
incoming** finds what arrived and files it as an ordinal or a token.

### PeerPay payments

A person paying you from another BRC-100 wallet usually can't hand the payment to Vela directly, so
their wallet pays a fresh key derived from your identity key and leaves a note at a MessageBox
server (a "post office") saying how to find it. The **Post Offices** panel shows those payments and
lets you take them in.

A sender's wallet delivers to the post office you've advertised, if you have one, and otherwise to
its own default. Wallets ship with different defaults, so Vela checks several: the one you
advertise, any you list in `VELA_MESSAGEBOX_HOSTS`, and the common public ones (Babbage's, the BSV
Association's, 1Sat's and the MessageBox library's default). Checking only reads; it never
advertises a post office for you.

**Accept** recomputes the key the payment should pay, refuses it unless an output pays exactly that
key, files it in the wallet with `internalizeAction`, and only then clears the note from the post
office. A copy of each note is kept in the data volume first, since until the payment is filed the
note is the only record of how to spend it. If clearing the note fails, the payment is already in
the wallet, and accepting it again is harmless.

Vela sees only the post offices it checks. A payment left anywhere else, including at post offices
that come online later, won't show up unless you add that post office to `VELA_MESSAGEBOX_HOSTS` or
the sender's wallet looks up one you've advertised. That's how MessageBox works today: when a
recipient hasn't advertised a post office, nothing tells the sender where to deliver.

**Sending.** The same panel sends a PeerPay payment to another identity key. Vela looks up the post
office the recipient advertises and leaves the note there. If they advertise none, you choose from
the post offices Vela knows; pick the one the recipient's wallet checks, if you know it, since their
wallet may not check the others.

The panel works for your main identity only, not per-app identities.

## The dashboard

| Section | What it's for |
| --- | --- |
| **Identity** | Your identity key, the public key apps know you by. Every payment address and app identity derives from it. Also shows the network. |
| **Balance** | Spendable sats, number of coins (UTXOs) and their average size, with the dollar value. |
| **Baskets** | Every basket in the wallet: `default` holds spendable coins and change, app baskets hold tokens apps wrote (notes, tickets, tasks). |
| **Ordinals** | Ordinals this wallet holds, plus any address you want to watch (read from the 1Sat indexer, shown for reference and proving nothing about ownership). Its receive address and **Scan for incoming** bring new ones in. |
| **Tokens (BSV-21)** | Balances of fungible tokens, kept in their own basket apart from ordinals. |
| **Identity Certificates** | Certificates issued to your identity key. Field names are shown; values stay encrypted. |
| **Post Offices** | PeerPay payments waiting for you at MessageBox servers, with **Accept**, and a form to send one (see PeerPay payments). |
| **App Access** | Which apps may connect at all, reads included. Type the app's address as you would a budget's site (`app.example`, or `localhost:8088` for a local app); Vela stores the exact web origin the browser sends (`https://app.example`, `http://localhost:8088`). Changes take effect on the next request. Here you also choose who each app sees (see Per-app identities). Both are kept per computer. |
| **App Spending Permissions** | Monthly budgets, one per site, stored in your wallet as BRC-73 tokens. Budgets are kept per site, without `https://` or a port, so a budget for `localhost` covers every localhost address. Granting one costs the app's identity a few sats. |
| **App Activity** | What each app asked the wallet, in plain English, including what was refused, even before an app is let in. It records the shape of each request, never its contents. |
| **Waiting for proof** | Transactions the wallet hasn't recorded as mined. `unproven` ones were broadcast and are usually in a block already; the records catch up when the storage server fetches the block proof. Other statuses mean the transaction isn't finished. |
| **Deposit** | Your receive address, with Check and Claim (see Receiving money). |
| **Transaction History** | Everything the wallet has sent and received. |
| **x402 Payments** | Payments to paid APIs made through an x402 client that labels its transactions `x402`. |
| **UTXO Distribution** | How your sats are split across coins, by size. |

## The activity log

Every request an app makes, for any of the 28 BRC-100 wallet methods, becomes one entry in App
Activity, whether Vela allowed it or not. Each entry has:

- **When, and which app** (or "local" for a program on this computer).
- **What it asked, in plain English**, for example "Asked for your identity key (the key that says
  who you are)" or "Asked the wallet to tag data with a keyed checksum (HMAC)".
- **A category:** info, identity, read, crypto, certificate or spend.
- **The outcome:** allowed, blocked or failed, with the reason when it was refused.
- **The shape of the request:** protocol and security level, key ID, counterparty, basket, amount in
  sats, certifier, certificate field names and the size of the data.
- **A short summary of what came back**, and **which identity answered** when it wasn't your main one.

It never records contents: no plaintext, ciphertext, signed data, certificate values or keys. The
log is kept in the data volume and rolls over at 5 MB.

## Per-app identities

Vela can show each app a different identity instead of your main one. Set
`WALLET_SUBSTRATE_PER_APP_IDENTITY=true`, then choose for each app under App Access:

- **Main:** the app sees your main identity, as in most wallets.
- **Private:** the app gets an identity of its own, derived from your seed, that no other app sees.
- **Persona:** a named identity that several apps share, so they can recognize you to each other.

Each identity has its own coins and its own budgets. A new identity starts empty, so top it up from
your main identity in App Access before granting it a budget. All identities derive from the one
seed, so the 24 words restore them all.

What a separate identity does and doesn't hide:

- An app sees only the identity key you chose for it, so two apps given private identities can't
  match you by key.
- Topping up an identity from your main one is an ordinary payment, and the coins that fund it can
  link the two on-chain. An app that saw one of those coins before can connect them.
- Certificates belong to the key they were issued to. A private identity has none, and certifying
  it with the same details as your main identity would make the two easy to match.

On a storage server that charges identities it doesn't know, each new identity needs to be allowed
there too.

## How Vela works

- **Rules, set ahead of time.** Access and budgets live in the dashboard. Anything outside them is
  refused and logged.
- **Nothing allowed until you allow it.** No app connects or spends until you add it and give it a
  budget.
- **Signing under coin protocols is refused by default.** Signature requests under the protocols
  that lock your coins (BRC-29 payments and 1Sat ordinals) are allowed only for apps on the spend
  allowlist (`WALLET_SUBSTRATE_ORIGINS`, empty by default). A budget doesn't unlock them: a signature
  carries no amount to count against it. Ordinary signing, for messages and logins, works as usual.
- **One identity per app, if you want it** (see Per-app identities).
- **An activity log of what apps ask for**, not just what they spend. It comes from how Vela is
  built: every app request passes through one layer in front of the wallet, where the rules are
  checked, so each request is recorded there with the decision made (see The activity log).
- **No local database.** The records live on the storage server you choose; Vela keeps only its
  settings, its activity log and the encrypted seed.
- **Ordinals and BSV-21 tokens** are handled in the wallet, each in its own basket.
- **Its own recovery words.** They restore the wallet in Vela; other wallets derive keys
  differently.

## Settings

| Setting | Required | Meaning |
| --- | --- | --- |
| `WALLET_STORAGE_URL` | yes | The BRC-100 storage server that keeps the wallet's records. |
| `VELA_DASHBOARD_KEY` | yes | Password for the dashboard and the setup page (`?key=`). |
| `WALLET_SEED` | no | 64 hex characters. Skips setup and the password: for labs and automation only, since anyone who can run `docker inspect` here can read it. |
| `CHAIN` | no | `main` (default) or `test`. |
| `WALLET_SUBSTRATE_ENFORCE_SPENDING` | no | `true` (default): spending needs a budget. |
| `WALLET_SUBSTRATE_ORIGINS` | no | Comma-separated web origins allowed to sign under coin-locking protocols. Empty by default. |
| `WALLET_SUBSTRATE_PER_APP_IDENTITY` | no | `false` (default): every app sees your main identity. `true`: choose per app. |
| `VELA_MESSAGEBOX_HOSTS` | no | Extra post offices (MessageBox servers) to check for PeerPay payments, comma-separated, each `https://…` or `Label=https://…`. The public defaults are always checked. |
| `BLOCK_HEADERS_URL` | no | A Block Headers Service to check proofs against, in place of the wallet toolbox's default Chaintracks service. |
| `ARC_API_KEY` | no | Key for the ARC broadcaster, if yours needs one. |

The data volume (`/data`) holds the encrypted seed, the list of allowed apps, the activity log,
the identity choices and copies of accepted PeerPay notes. Keep it, and keep your 24 words: with both gone, the wallet can't be
restored.

## Build

`bash scripts/build.sh` builds the image from committed files only (`git archive HEAD`). First it
scans them for secrets and for names of private infrastructure, and stops if it finds any.
`bash scripts/build.sh --check` runs the scan without building.

For development, `npm ci && npm run build` compiles to `dist/`.
