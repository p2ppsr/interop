#!/usr/bin/env python3
"""Fetch exact private qualification inputs using the job's short-lived token."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import tarfile
import urllib.request
from urllib.parse import quote

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--runtime-only', action='store_true')
args = parser.parse_args()

manifest = json.loads(Path('config/shared-device-runtime.json').read_text())
destination = Path(os.environ['RUNNER_TEMP']) / 'shared-device-runtime'
destination.mkdir(mode=0o700)


def fetch(record, path):
    url = ('https://storage.googleapis.com/storage/v1/b/' + record['bucket'] + '/o/'
           + quote(record['object'], safe='') + '?alt=media&ifGenerationMatch=' + record['generation'])
    request = urllib.request.Request(url, headers={'Authorization': 'Bearer ' + os.environ['GOOGLE_ACCESS_TOKEN']})
    digest = hashlib.sha256()
    with urllib.request.urlopen(request, timeout=120) as response, path.open('xb') as out:
        while chunk := response.read(1024 * 1024):
            digest.update(chunk)
            out.write(chunk)
    if path.stat().st_size != record['size'] or digest.hexdigest() != record['sha256']:
        raise RuntimeError('Pinned runtime input failed integrity verification')


archive = destination / 'transport.tgz'
fetch(manifest['runtime'], archive)
with tarfile.open(archive) as bundle:
    bundle.extractall(destination, filter='data')
if not args.runtime_only:
    fetch(manifest['metanetLabApk'], destination / 'metanet.apk')
print(json.dumps({'runtimeSourceCommit': manifest['sourceCommit'], 'inputsVerified': True,
                  'qualificationOnly': manifest['qualificationOnly']}))
