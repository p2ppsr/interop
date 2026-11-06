# Public settings token identity profile

`plan-trusted.json` adds eight identity trust assertions to the integrated native
profile. The original `plan.json` keeps its untrusted issuer expectation and its
69 assertions. The prospective variant has 77 assertions and retains the same
600-second limit per repetition.

The harness publishes a certificate from the isolated fixture issuer and records
exclusion through both native public discovery methods. `WalletSettingsManager`
from the pinned Toolbox writes an encrypted, signed settings token through the
unchanged wallet's public CWI methods. This token uses the native wallet's
existing `wallet settings` basket, `settings` key and encryption protocol. The
harness waits 121 seconds for the native 120-second trust cache to expire before
checking positive discovery by identity and attributes. `forceRefresh` alone
does not refresh that trust cache.

The finalizer restores the exact original logical settings. It deletes the token
when the original basket was empty, or signs a replacement containing the original
settings when a token existed. Evidence retains the original, temporary and
restored public responses, signed transaction ancestry and real elapsed time.
The offline oracle proves that the temporary token was spent and rejects altered
restoration, elapsed time or retirement transactions. Container retirement clears
any residual in-memory trust cache after the durable settings are restored.

The public report records explicit JavaScript `undefined` values as JSON `null`
with their exact JSON Pointer paths in `serialization.undefinedPaths`. This
preserves optional argument positions and distinguishes undefined from explicit
null. Wallet calls and returned values remain unchanged; only the evidence
snapshot uses this encoding.

No native key, private object, cache, clock or database is modified by this
configuration path. The isolated issuer key and mined funding belong to the
controlled fixture. Positive discovery under explicit temporary trust does not
change the original profile's default-trust result or establish full BRC-100
conformance.

Run the prospective profile with
`node scripts/run-native-go-wallet.mjs IMAGE OUTPUT --integrated-trusted`.
Verify an extracted repetition's `evidence/integrated` directory with
`node scripts/verify-native-trust.mjs DIRECTORY`; the enclosing native verifier
also checks source, profile, artifact, sandbox and transaction evidence.
