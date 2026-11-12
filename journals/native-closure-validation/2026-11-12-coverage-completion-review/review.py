#!/usr/bin/env python3
"""Read-only independent archive review; virtual hostile reads never alter originals."""
from pathlib import Path
import copy, gzip, hashlib, json, subprocess, sys, traceback
from unittest.mock import patch
ROOT = Path(__file__).resolve().parents[3]
BASE = ROOT / 'journals/native-closure-validation/2026-11-12-coverage-completion'
EXPECTED_MANIFEST = 'd385fc517b93c3db44a63edaa32689726cde0683b0635035a9a5e733e7017a80'
SHA = lambda b: hashlib.sha256(b).hexdigest()
ENC = lambda v: (json.dumps(v, indent=2) + '\n').encode()
READ = Path.read_bytes
manifest_bytes = READ(BASE / 'validation.json')
assert SHA(manifest_bytes) == EXPECTED_MANIFEST, 'Reviewed archive identity differs'
M = json.loads(manifest_bytes)
V = READ(BASE / 'verify.py')
C = READ(BASE / 'completion.json')

def adversarial(case):
    m = copy.deepcopy(M)
    overrides = {}
    missing = set()
    symlinks = set()
    extras = []
    obj = m['objects'][0]
    op = BASE / obj['path']
    physical = {r['path']: r for r in m['physicalFiles']}
    current = False
    if case == 'omit-logical-member':
        m['members'].pop()
        m['statistics']['logicalMembers'] -= 1
    elif case == 'omit-receipt':
        m['receiptInventory'].pop()
    elif case == 'omit-physical-entry':
        m['physicalFiles'] = [r for r in m['physicalFiles'] if r['path'] != obj['path']]
    elif case == 'missing-object':
        missing.add(op)
    elif case == 'alter-object-byte':
        b = bytearray(READ(op)); b[-1] ^= 1; overrides[op] = bytes(b)
    elif case == 'rehashed-decoded-object':
        raw = gzip.decompress(READ(op)) + b'altered original observation\n'
        old_name = obj['path']; new_name = 'objects/' + SHA(raw) + '.gz'
        stored = gzip.compress(raw, mtime=0)
        missing.add(op); extras.append(BASE / new_name); overrides[BASE / new_name] = stored
        obj.update(path=new_name, bytes=len(stored), sha256=SHA(stored), decodedBytes=len(raw), decodedSha256=SHA(raw))
        for r in m['members']:
            if r['object'] == old_name:
                r.update(object=new_name, bytes=len(raw), sha256=SHA(raw))
        physical[old_name].update(path=new_name, bytes=len(stored), sha256=SHA(stored))
    elif case == 'additional-unindexed-file':
        p = BASE / 'unlisted.txt'; extras.append(p); overrides[p] = b'unindexed\n'
    elif case == 'object-symlink':
        symlinks.add(op)
    elif case == 'rehashed-support-file':
        p = BASE / 'README.md'; b = READ(p) + b'Claim altered\n'; overrides[p] = b
        physical['README.md'].update(bytes=len(b), sha256=SHA(b))
    elif case == 'erase-historical-source-limitations':
        m['historicalHashOnlyReferences'] = []
    elif case == 'invent-native-qualification':
        m['nativeQualification'] = True
    elif case == 'alter-validation-count':
        m['validation']['synthesisPassed'] += 1
    elif case == 'coherent-completion-rewrite':
        m['members'].pop(); m['statistics']['logicalMembers'] -= 1
        c = json.loads(C)
        c['manifestProjection'] = {k: v for k, v in m.items() if k not in ['completionReceipt', 'physicalFiles']}
        cb = ENC(c); overrides[BASE / 'completion.json'] = cb
        m['completionReceipt'].update(bytes=len(cb), sha256=SHA(cb))
        physical['completion.json'].update(bytes=len(cb), sha256=SHA(cb))
    elif case == 'alter-linked-artifact':
        p = ROOT / m['additionalLinkedArtifactReferences'][0]['path']
        overrides[p] = READ(p) + b'changed'
    elif case == 'alter-current-source':
        rows = {r['logicalPath']: r for r in m['members']}
        freeze = json.loads(gzip.decompress(READ(BASE / rows[m['freezeMember']]['object'])))
        p = ROOT / next(iter(freeze['sourceInputs']))
        overrides[p] = READ(p) + b'changed'
        current = True
    else:
        raise AssertionError('Unknown case ' + case)
    if m != M:
        overrides[BASE / 'validation.json'] = ENC(m)
    assert overrides or missing or symlinks or extras, 'Mutation is empty'
    original_file, original_symlink, original_glob = Path.is_file, Path.is_symlink, Path.rglob
    def read(p):
        if p in missing: raise FileNotFoundError(p)
        return overrides[p] if p in overrides else READ(p)
    def is_file(p):
        return False if p in missing else True if p in overrides else original_file(p)
    def is_symlink(p):
        return p in symlinks or original_symlink(p)
    def rglob(p, pattern):
        for q in original_glob(p, pattern):
            if q not in missing: yield q
        if p == BASE:
            yield from extras
    sys.argv = [str(BASE / 'verify.py')] + (['--current-source'] if current else [])
    with patch.object(Path, 'read_bytes', read), patch.object(Path, 'is_file', is_file), patch.object(Path, 'is_symlink', is_symlink), patch.object(Path, 'rglob', rglob):
        exec(compile(V, str(BASE / 'verify.py'), 'exec'), {'__file__': str(BASE / 'verify.py'), '__name__': '__main__'})

if '--case' in sys.argv:
    adversarial(sys.argv[sys.argv.index('--case') + 1])
    sys.exit(0)

out = Path(sys.argv[sys.argv.index('--output') + 1]).resolve() if '--output' in sys.argv else ROOT / 'out/native-closure-20261111/coverage-completion-archive-independent/reproduction'
out.mkdir(parents=True, exist_ok=True)
results = []
def run(name, cmd, success):
    result = subprocess.run(cmd, cwd=ROOT, capture_output=True, timeout=120)
    (out / (name + '.stdout')).write_bytes(result.stdout)
    (out / (name + '.stderr')).write_bytes(result.stderr)
    passed = result.returncode == 0 if success else result.returncode != 0 and b'AssertionError' in result.stderr
    row = {'name': name, 'expected': 'ACCEPT' if success else 'REJECT', 'exitCode': result.returncode, 'passed': passed,
           'stdoutSha256': SHA(result.stdout), 'stderrSha256': SHA(result.stderr)}
    results.append(row)
    assert passed, row
run('original-current-source', [sys.executable, str(BASE / 'verify.py'), '--current-source'], True)
for name in ['omit-logical-member', 'omit-receipt', 'omit-physical-entry', 'missing-object', 'alter-object-byte', 'rehashed-decoded-object', 'additional-unindexed-file', 'object-symlink', 'rehashed-support-file', 'erase-historical-source-limitations', 'invent-native-qualification', 'alter-validation-count', 'coherent-completion-rewrite', 'alter-linked-artifact', 'alter-current-source']:
    run(name, [sys.executable, str(Path(__file__).resolve()), '--case', name], False)
# Independently bind all 391 frozen inputs to retained decoded bytes or immutable linked files.
rows = {r['logicalPath']: r for r in M['members']}
freeze = json.loads(gzip.decompress(READ(BASE / rows[M['freezeMember']]['object'])))
retained = {r['sha256'] for r in M['members']} | {r['sha256'] for r in M['linkedImmutableEvidence'] + M['additionalLinkedArtifactReferences']}
assert len(freeze['sourceInputs']) == 391
assert all(h in retained for h in freeze['sourceInputs'].values())
assert all(SHA(READ(ROOT / p)) == h for p, h in freeze['sourceInputs'].items())
assert SHA(READ(BASE / 'validation.json')) == EXPECTED_MANIFEST
assert READ(BASE / 'verify.py') == V and READ(BASE / 'completion.json') == C
receipt = {'schema': 'tpnil-validation-archive-independent-review@1', 'verified': True, 'archiveSha256': EXPECTED_MANIFEST, 'claim': 'ARCHIVE_INTEGRITY_AND_SOURCE_BINDING_REVIEW_ONLY',
 'nativeQualification': False, 'manifest': str((BASE / 'validation.json').relative_to(ROOT)), 'manifestSha256': EXPECTED_MANIFEST,
 'verifierSha256': SHA(V), 'completionSha256': SHA(C), 'runtimeInputs': 391, 'allRuntimeInputBytesRetained': True,
 'originalArchiveUnchanged': True, 'results': results, 'positiveControls': 1, 'negativeControls': 15,
 'limits': ['The trusted reviewed verifier and its externally recorded hashes are the integrity anchor; replacing both verifier and all evidence requires an external Git/receipt trust decision.',
 'This invocation verifies retained evidence bytes, inventory, source and explicit gate summaries. It does not rerun the archived SDK/browser/Go/native semantics or create a native qualification.',
 'Six intermediate historical source references are explicitly hash-only and nonreplayable; historical local binaries are not portable archived executables.',
 'All 391 frozen native input bytes are retained or independently linked. The 3033 complete gate inputs are checked against current repository files; not all non-native gate inputs are duplicated in this archive.',
 'Full 698-observation native capacity, actual dollar costs and future native outcomes remain unqualified/unknown.']}
(out / 'review.json').write_bytes(ENC(receipt))
print(json.dumps({'passed': True, 'manifestSha256': EXPECTED_MANIFEST, 'positive': 1, 'negative': 15, 'receipt': str(out / 'review.json')}))
