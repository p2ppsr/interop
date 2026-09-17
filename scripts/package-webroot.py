#!/usr/bin/env python3
"""Deterministic compiled web-root packaging. Does not build or execute a SUT."""
import argparse
import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import tarfile

MAX_BYTES = 256 * 1024 * 1024
MAX_FILES = 10000

def package(root: Path, destination: Path):
    if root.is_symlink() or not root.is_dir():
        raise ValueError('Web root must be a real directory')
    root = root.resolve()
    if destination.resolve().is_relative_to(root):
        raise ValueError('Output must be outside the web root')
    if not (root / 'index.html').is_file():
        raise ValueError('A compiled web root requires index.html')
    entries, total = [], 0
    for entry in sorted(root.rglob('*'), key=lambda p: p.relative_to(root).as_posix().encode('utf-8')):
        relative = entry.relative_to(root).as_posix()
        if entry.is_symlink():
            raise ValueError('Symlinks are not permitted')
        if any(p == '.git' or p == '.env' or p.startswith('.env.') for p in entry.relative_to(root).parts):
            raise ValueError('Source metadata or environment file in compiled web root')
        if entry.is_dir():
            continue
        if not entry.is_file():
            raise ValueError('Only regular files are permitted')
        if '\\' in relative or ':' in relative or any(ord(c) < 32 for c in relative):
            raise ValueError('Nonportable archive path')
        total += entry.stat().st_size
        if total > MAX_BYTES or len(entries) >= MAX_FILES:
            raise ValueError('Web root exceeds packaging limits')
        data = entry.read_bytes()
        entries.append((relative, data))
    # Construct before committing any output; gzip metadata and tar ownership are fixed.
    tar_bytes = io.BytesIO()
    with tarfile.open(fileobj=tar_bytes, mode='w', format=tarfile.USTAR_FORMAT) as tar:
        for name, data in entries:
            info = tarfile.TarInfo(name)
            info.size = len(data)
            info.mtime = 0
            info.uid = info.gid = 0
            info.uname = info.gname = ''
            info.mode = 0o644
            tar.addfile(info, io.BytesIO(data))
    output = io.BytesIO()
    with gzip.GzipFile(fileobj=output, mode='wb', filename='', mtime=0, compresslevel=9) as stream:
        stream.write(tar_bytes.getvalue())
    archive = output.getvalue()
    files = [{'path': name, 'sha256': hashlib.sha256(data).hexdigest(), 'size': len(data), 'mode': '0644'} for name, data in entries]
    manifest = {'schemaVersion': '0.1.0', 'kind': 'compiled-webroot', 'sha256': hashlib.sha256(archive).hexdigest(), 'size': len(archive), 'fileTreeSha256': hashlib.sha256(json.dumps(files, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest(), 'files': files}
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open('xb') as stream:
        stream.write(archive)
        stream.flush()
        os.fsync(stream.fileno())
    return manifest

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    print(json.dumps(package(args.root, args.output), indent=2, ensure_ascii=False))

if __name__ == '__main__':
    main()
