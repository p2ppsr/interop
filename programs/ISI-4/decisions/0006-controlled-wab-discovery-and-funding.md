# ISI-4 decision 0006 — controlled WAB, discovery, and mined funding

Recorded 2026-09-20 by the founding steward.

ISI-4 may configure an unchanged production wallet to use a WAB operated by the ITCVE when the wallet exposes that choice through its ordinary setup interface. The ITCVE may provision a phone-shaped account identifier and one-time code through the WAB's declared test-administration interface. The identifier is a laboratory fixture, no SMS or public telephone service is involved, and the wallet continues through its normal authentication and recovery-key flow.

The first profile uses WAB 1.8.2 from `bsv-blockchain/ts-stack` revision `6e53b215c43af5ea2e50bcdb7f136e23ee7da080`. Its `/demo` profile advertises `DemoPhone`, while retaining compatibility with wallets that send the older `TwilioPhone` wire value. The ITCVE runs the exact WAB authentication implementation. It supplies the demo faucet endpoint at the same controlled WAB origin with Wallet Toolbox because the upstream development SQLite adapter does not recover the inserted payment identifier in this configuration. That service implementation is laboratory infrastructure and does not alter the wallet SUT.

The controlled funding source is a mature output mined by the pinned `TPNIL-TERANODE-REGTEST-1` profile. Teranode mines the output directly to the WAB controller's declared wallet-payment derivation. The retained fixture includes the raw coinbase transaction, block header, block hash, height, Merkle root, Atomic BEEF, payment remittance, source revision, image pin, and digests. The controller verifies all of these properties before it internalizes the output. The WAB then creates the user's ordinary faucet payment through Wallet Toolbox. The wallet remains configured as a mainnet production wallet; the Teranode chain is an isolated ITCVE service reality and does not represent public-mainnet acceptance.

The Android profile discards the AVD's writable operating-system partitions and user data before each run, installs that run's ITCVE certificate authority, and directs its proxy setting to the controller. Requests for the wallet's fixed root SLAP trackers, the selected WAB and Wallet Storage origins, transaction broadcast services, proof services, and the application origin terminate inside the ITCVE. Other destinations receive a controlled error. Every requested host and path is recorded.

The ITCVE root resolver returns signed SLAP advertisements for `ls_users` and `ls_ship`. Its SHIP resolver returns the signed `tm_users` advertisement. The UMP overlay accepts only `tm_users` submissions whose PushDrop fields contain the required presentation and recovery hashes and valid versioned password metadata. It rejects duplicates and malformed outputs, retains the submitted BEEF, and answers `ls_users` lookups by presentation hash, recovery hash, or outpoint.

The first Metanet Explorer run freezes these acceptance conditions before execution:

1. V001 passes only if the admitted AAB derivative is installed from cleared state, the UI selects mainnet and the controlled service URLs, WAB authentication completes, the recovery acknowledgement completes, one valid UMP record is admitted and returned through controlled discovery, and the WAB payment derived from the Teranode-mined output becomes spendable.
2. V002 passes only if the canonical ToDo artifact creates the declared encrypted task, the wallet emits a concrete transaction, the controlled submission service accepts it, and retained BEEF identifies the returned transaction.
3. V003 passes only if a stopped and restarted application reconstructs the same task and satoshi value from wallet state at the same origin.
4. V004 passes only if redemption spends the created task, produces a separately retained accepted transaction, and the task is absent after completion.
5. The run records the permission decisions it actually exercises. It does not pass V005 without the adopted deny and alternate-origin cases.
6. The run records accepted transaction processing. It does not pass V006 without the adopted rejection and recovery schedule.
7. V007 and V008 retain the blockers in the version 1.0.0 catalog.

The executable first run is an experimental conformance result. Random account keys, one-time codes, signatures, transaction identifiers, and block identifiers may vary in an independently regenerated environment. Determinism is assessed through the declared semantic projection and verified ancestry, while the exact bytes from each run remain immutable evidence.
