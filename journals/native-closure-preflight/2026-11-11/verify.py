#!/usr/bin/env python3
"""Verify retained bytes without executing any fixture, wallet, or service."""
from pathlib import Path
import gzip
import hashlib
import json

here = Path(__file__).resolve().parent
repo = here.parents[2]
manifest = json.loads((here / 'manifest.json').read_text())
sha = lambda value: hashlib.sha256(value).hexdigest()
seen = set()
for row in manifest['records']:
    name = Path(row['path'])
    assert not name.is_absolute() and '..' not in name.parts and row['path'] not in seen
    seen.add(row['path'])
    target = here / name
    assert target.resolve().is_relative_to(here) and not target.is_symlink()
    stored = target.read_bytes()
    assert len(stored) == row['storedBytes'] and sha(stored) == row['storedSha256'], name
    assert row['encoding'] == 'gzip' and stored[4:8] == b'\0\0\0\0'
    raw = gzip.decompress(stored)
    assert len(raw) == row['rawBytes'] and sha(raw) == row['rawSha256'], name
for row in manifest['repositoryReferences']:
    name = Path(row['path'])
    assert not name.is_absolute() and '..' not in name.parts
    target = repo / name
    assert target.resolve().is_relative_to(repo)
    data = target.read_bytes()
    assert len(data) == row['bytes'] and sha(data) == row['sha256'], name
print(json.dumps({'verified': True, 'records': len(manifest['records']),
                  'repositoryReferences': len(manifest['repositoryReferences']),
                  'rawBytes': sum(row['rawBytes'] for row in manifest['records']),
                  'storedBytes': sum(row['storedBytes'] for row in manifest['records'])}, indent=2))
