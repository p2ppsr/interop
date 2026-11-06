# Public settings trust reference observations

These local engineering observations exercise the prospective public settings
token helper with Toolbox 2.13.0 and the pinned Go Wallet Storage compatibility
build. They are not native-wallet qualification. The exact unchanged Yours
5.1.0 archive was inspected read-only to establish the settings-token and cache
semantics; its digest and inspected source locations are retained separately
inside the evidence bundle.

Both executable cases passed 42 boundary assertions and eight trust assertions:
an originally absent settings token, and an existing token with currency GBP.
Each waited at least 121 real seconds, discovered the published identity through
both methods, restored the original logical settings and spent the temporary
trust token. The offline verifier independently replayed both cases and rejected
three evidence mutations. The preliminary probe additionally checked cold
reference-wallet token rehydration and exclusion after token retirement.

The first two executions passed the raw predicates. A subsequent regression
through the actual `EvidenceBundle` serializer rejected a fractional elapsed-time
field. That failure and both original reports remain in the bundle. After
conservative integer rounding, two fresh executions repeated the real waits and
passed serialization plus independent verification. The settings oracle compares
parsed JSON values so canonical evidence key ordering preserves its meaning.

`summary.json` binds the compressed evidence, source files, run counts and wait
receipts. `evidence.json.gz` contains a JSON inventory with exact UTF-8 content,
size and SHA-256 for every raw result, trace, source probe and validation log.
The source base identifies the shared working tree before the prospective
changes were committed; explicit source digests identify the helper used here.

Extract the bundle with this command from the repository root:

```sh
python3 - <<'PY'
import gzip, hashlib, json
from pathlib import Path
p = Path('journals/native-identity-trust-reference/2026-11-06')
s = json.loads((p / 'summary.json').read_text())
b = (p / s['archive']['path']).read_bytes()
assert hashlib.sha256(b).hexdigest() == s['archive']['sha256']
for row in json.loads(gzip.decompress(b))['files']:
    name = Path(row['path'])
    assert not name.is_absolute() and '..' not in name.parts
    data = row['content'].encode()
    assert len(data) == row['size']
    assert hashlib.sha256(data).hexdigest() == row['sha256']
    target = Path('out/trust-reference-replay') / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
PY
node scripts/verify-native-trust.mjs out/trust-reference-replay/identity-trust-reference-2
node scripts/verify-native-trust.mjs out/trust-reference-replay/identity-trust-reference-existing-2
node scripts/verify-wallet-boundary.mjs out/trust-reference-replay/identity-trust-reference-2 --integrated
node scripts/verify-wallet-boundary.mjs out/trust-reference-replay/identity-trust-reference-existing-2 --integrated
```

The retained execution probes expect to be copied to `out/` before running with
the synthesis `tsx` executable. They use owned local processes and the declared
mined fixture. Re-execution is separate from offline evidence verification.
