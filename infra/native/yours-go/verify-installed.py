"""Bind the executed read-only directories to the exact admitted archives."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import stat
import tarfile
import zipfile

ROOT = Path('/work')

def safe(name):
    value = PurePosixPath(name)
    if value.is_absolute() or '..' in value.parts:
        raise ValueError('Unsafe archive member')
    return str(value)

def verify(directory, expected):
    actual = {}
    for file in directory.rglob('*'):
        if file.is_symlink():
            raise ValueError('Symlink in executed artifact')
        if file.is_file():
            actual[str(file.relative_to(directory))] = hashlib.sha256(file.read_bytes()).hexdigest()
    if actual != expected:
        raise ValueError('Executed files differ from admitted archive')
    return hashlib.sha256(json.dumps(actual, sort_keys=True, separators=(',', ':')).encode()).hexdigest()

parser = argparse.ArgumentParser()
parser.add_argument('--wallet-version', choices=['5.1.0', '5.1.1', '5.1.1-pr368.7e39006', '5.1.1-pr368.cb3c2f2', '5.1.1-pr368.4a954ac', '5.1.1-pr368.3e8a97f'], default='5.1.0')
version = parser.parse_args().wallet_version
candidate_directories = {'5.1.1-pr368.3e8a97f': 'yours-wallet-pr368-3e8a97f', '5.1.1-pr368.7e39006': 'yours-wallet-pr368-7e39006', '5.1.1-pr368.cb3c2f2': 'yours-wallet-pr368-cb3c2f2', '5.1.1-pr368.4a954ac': 'yours-wallet-pr368-4a954ac'}
candidate = version in candidate_directories
manifest_version = '5.1.1' if candidate else version
wallet = ROOT / ('out/sut-artifacts/' + candidate_directories[version] if candidate else f'out/sut-artifacts/yours-wallet-v{version}')
archive_path = wallet / f'pw-v{manifest_version}.zip'
expected_archive = {
    '5.1.1-pr368.3e8a97f': ('9da87d79ac7ac70e3c5dee50451b2f0456b51f5e480b1be0925cd24a7707e184', 13245082),
    '5.1.1-pr368.4a954ac': ('cd12b686c5295061bd4b727b32e17c3686e210fcdfa6aa2193790590458d9105', 13244753),
    '5.1.0': ('d55abda7dc8790ecfdd57ed0f5f4dd4a28187bb4833715f7612b067625eabc52', 13513123),
    '5.1.1': ('454c8581b8d6ab120c9b2f2f74167f536b08e720bc12e75f3e9437d14a985878', 13644482),
    '5.1.1-pr368.7e39006': ('b80e5a7572bdf11e568ecf41cbf439a0062605a5a2f196b53948b18e1b7fe10e', 13238310),
    '5.1.1-pr368.cb3c2f2': ('0fff8b6ff51a0c54032e340bdc1878abf751f577ad94d6ee06146e336fd87cc3', 13243164),
}[version]
archive_bytes = archive_path.read_bytes()
if (hashlib.sha256(archive_bytes).hexdigest(), len(archive_bytes)) != expected_archive:
    raise ValueError('Wallet archive differs from selected immutable artifact')
if candidate:
    candidate_manifest = json.loads((ROOT / 'fixtures/artifacts' / candidate_directories[version] / 'provenance.json').read_text())
    if candidate_manifest['officialRelease'] is not False or candidate_manifest['claim'] != 'ENGINEERING_OBSERVATION_ONLY' or candidate_manifest['wallet']['version'] != version or candidate_manifest['manifestVersion'] != manifest_version or (candidate_manifest['wallet']['sha256'], candidate_manifest['wallet']['size']) != expected_archive:
        raise ValueError('Candidate provenance differs from selected immutable artifact')
with zipfile.ZipFile(archive_path) as archive:
    if json.loads(archive.read('build/manifest.json'))['version'] != manifest_version:
        raise ValueError('Embedded wallet manifest version differs')
    if sum(item.file_size for item in archive.infolist()) > 200_000_000:
        raise ValueError('Wallet archive budget exceeded')
    expected = {}
    for item in archive.infolist():
        if item.is_dir():
            continue
        name = safe(item.filename)
        if stat.S_ISLNK(item.external_attr >> 16) or name in expected:
            raise ValueError('Unsupported wallet archive entry')
        expected[name] = hashlib.sha256(archive.read(item)).hexdigest()
    wallet_digest = verify(wallet / 'unpacked', expected)
with tarfile.open(ROOT / 'fixtures/artifacts/todo-ts-236733c-webroot.tgz') as archive:
    expected = {}
    for item in archive:
        if item.isdir():
            continue
        name = safe(item.name)
        if not item.isfile() or name in expected or item.size > 16_000_000:
            raise ValueError('Unsupported application archive entry')
        expected[name] = hashlib.sha256(archive.extractfile(item).read()).hexdigest()
    app_digest = verify(ROOT / 'out/sut-artifacts/todo-ts-236733c/webroot', expected)
print(json.dumps({'walletDirectorySha256': wallet_digest, 'applicationDirectorySha256': app_digest, 'exactArchiveContents': True}))
