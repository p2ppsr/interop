from pathlib import Path
import argparse, gzip, hashlib, json

parser = argparse.ArgumentParser()
parser.add_argument('--current-source', action='store_true')
args = parser.parse_args()
directory = Path(__file__).resolve().parent
root = directory.parents[2]
manifest = json.loads((directory / 'manifest.json').read_text())
sha = lambda b: hashlib.sha256(b).hexdigest()
assert sha(Path(__file__).read_bytes()) == manifest['verifierSha256']
assert {p.name for p in directory.iterdir()} == {'manifest.json', 'verify.py'} | {r['path'] for r in manifest['files']}
raw = {}
for row in manifest['files']:
    p = directory / row['path']
    assert p.parent == directory and row['path'] not in raw
    packed = p.read_bytes()
    assert len(packed) == row['bytes'] and sha(packed) == row['sha256']
    value = gzip.decompress(packed)
    assert len(value) == row['rawBytes'] and sha(value) == row['rawSha256']
    raw[row['path']] = value
review = json.loads(raw['review.json.gz'])
independent = json.loads(raw['independent-review-prep.json.gz'])
assert sha(raw['review.json.gz']) == independent['reviewSha256']
assert review['newNativeSessions'] == manifest['nativeSessions'] == 0
assert len(review['unchangedNativeInputs']) == 157
for row in review['files']:
    value = raw[row['path'] + '.gz']
    assert len(value) == row['bytes'] and sha(value) == row['sha256']
assert '1043 passed | 62 skipped (1105)' in raw['synthesis.log.gz'].decode()
assert 'pass 173' in raw['core.log.gz'].decode()
assert 'fail 0' in raw['core.log.gz'].decode()
assert 'Ran 5 tests' in raw['python.log.gz'].decode()
assert '\nOK\n' in raw['python.log.gz'].decode()
comments = {
    'native-coverage-extension.test.ts': '// Four complete cryptographic replays exceeded the default five-second unit\n// budget on the shared Linux runner. Keep every replay and its strict verdict.\n',
    'native-shutdown-ancestry.test.ts': '// This case signs a descendant and checks five complete profile/ancestry paths.\n// Its bounded unit-test budget does not change the native verifier or run limits.\n',
}
titles = {
    'native-coverage-extension.test.ts': 'retains lookup-not-found as a basket failure, never a namespace-validation pass',
    'native-shutdown-ancestry.test.ts': 'requires explicit expanded profile for permission5 and retains every denied ancestor guard',
}
for name, comment in comments.items():
    before = raw[name + '.before.gz'].decode()
    after = raw[name + '.after.gz'].decode()
    old = "it('" + titles[name] + "', async () => {"
    new = comment + "it('" + titles[name] + "', { timeout: 30_000 }, async () => {"
    assert before.count(old) == after.count(new) == 1
    assert before.replace(old, new) == after
    source = 'synthesis/test/' + name
    assert sha(after.encode()) == independent['changedFiles'][source]
    if args.current_source:
        assert (root / source).read_bytes() == after.encode()
if args.current_source:
    for path, digest in review['unchangedNativeInputs'].items():
        assert sha((root / path).read_bytes()) == digest, path
print(json.dumps({'verified': True, 'files': len(raw), 'unchangedTestBodies': 2,
                  'nativeSessions': 0, 'currentSourceChecked': args.current_source}))
