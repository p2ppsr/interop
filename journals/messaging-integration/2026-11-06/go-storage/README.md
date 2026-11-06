# Message Box helper over the all-Go service closure

Both fresh reference-wallet runs passed all six native-helper assertions using
patched Go Wallet Storage, Go Overlay Services and Go ChainTracks. Each ran real
TypeScript and adapted Go Message Box services with signed Overlay discovery,
fee-bearing encrypted delivery, exact recipient internalization, complete
Message Box restart, acknowledgment and payment replay rejection. TypeScript
replay returned 409 and adapted Go returned 400. Independent script/ancestry,
recipient derivation, ciphertext and receipt verification passed, as did both
negative verifier cases and flattened-evidence verification.

These are infrastructure engineering results from an actual Toolbox reference
payer. They do not replace the unchanged-native-wallet CI qualification. Each
archive includes its explicit caller declaration and executable driver. Every
file is hash-bound in its adjacent manifest. The earlier messaging archive index
and original attempts are unchanged.

Attempt 1 preceded a test-only patch refresh. Attempt 2 used the final rebuilt Go
storage binary `d4e02362b62dc7f1124b3d2a4a92a85ef10eb120e7b03b5eb4c84f1a6bb66efe`
and patch-lock hash
`73b327cb785ab061d58678ff6c26eefa46a9aa838d09d5f8bfee50aae3fb4391`.
The component manifest retains the exact admitted build identity in both cases.
All child services closed and the isolated Mongo containers were removed cleanly.
No paid resources or public-mainnet broadcasts were used; local capacity and
agent/operator cost remain unmeasured.

The accompanying read-only native audit confirmed relocation to `/work`,
non-root cache access, writable state confined to `/tmp` and `/evidence`, and use
of the worker-owned Mongo URI. It identified two independent gate gaps, corrected
by the parent integration: rerun base native qualification inside the integrated
verifier, and include the new storage/MessageBox executable names in the worker's
surviving-process check. Historical base profile behavior remains selected
separately from the new compatibility profile.
