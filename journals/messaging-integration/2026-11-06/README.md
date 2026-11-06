# Message Box integration evidence — 2026-11-06

The final standalone matrix (`messaging-attempt10`) contains **38 PASS, 3 FAIL,
0 BLOCKED** assertions. The TypeScript service and explicit Go compatibility
closure each pass all 14 applicable assertions. The unchanged Go baseline retains
three failures: recipient payment byte encoding, payment reuse, and payment reuse
after acknowledgment/restart. These failures are preserved rather than replaced
by adapter results. The Go source has no native WebSocket implementation; the
adapted closure uses actual maintained TypeScript AuthSocket with the same Go
server identity and the same Go SQLite state.

`index.json` binds every archive, archived file, result and verification output.
All ten matrix attempts and all three reference-wallet helper attempts are
retained, including failed samples. Archives total approximately 1 MB. They
contain isolated SQLite snapshots, original JSON/wire evidence and run logs; they
do not contain source caches, dependency trees or Mongo data. All task-owned
Mongo containers and child servers were stopped and removed. The unrelated
Docker workloads were not changed.

The final reference Toolbox wallet invocation of the native helper
(`native-messaging-engineering-3`) passes six assertions and independent evidence
verification. It is **not native wallet qualification**. Its `CALLER.txt` and
archived driver identify the actual reference wallet. The unchanged native
application must run the same helper through its admitted public boundary, and
that enclosing artifact/provenance envelope must independently pass. The helper
verifier checks the exact recipient output and wallet receipt, transaction
scripts/mined ancestry, value conservation, advertisement signature, decrypted
payload, restart/acknowledgment observations and replay exchange. Two negative
cases reject a missing recipient receipt and an invalid payment signature after
rebinding file hashes. Flattened native envelope JSON is also verified.

To inspect a final archive without overwriting original evidence:

```sh
mkdir -p out/messaging-review
tar -xzf journals/messaging-integration/2026-11-06/messaging-attempt10.tar.gz -C out/messaging-review
node scripts/verify-messaging.mjs out/messaging-review/messaging-attempt10
tar -xzf journals/messaging-integration/2026-11-06/native-messaging-engineering-3.tar.gz -C out/messaging-review
node scripts/verify-native-messaging.mjs out/messaging-review/native-messaging-engineering-3
```

Prepare the pinned messaging dependencies first. The native helper verifier also
accepts the enclosing native `integrated` directory directly. The older HTTP
profile is frozen at `components/messaging/profiles/http-polling-v1.json`, so
attempt7 remains independently verifiable. Attempts1–6 are retained development
observations under their then-current profile hashes, not current qualification
claims. The index explains each correction. The standalone negative test first
matched only an assertion error, whereas the SDK threw its more precise
`ScriptEvaluationError`; the matcher was corrected to preserve that independent
cryptographic rejection. The new native verifier initially derived the peer's
public key instead of the receiver's own BRC-29 key; `forSelf: true` corrected the
oracle. Neither correction changed recorded service results.

These are local controlled-fixture runs with no paid device lease, production
credentials or mainnet broadcast. Allocated local capacity, operator effort and
development-agent cost remain unmeasured; no economic improvement or zero-total-
cost claim is made.
