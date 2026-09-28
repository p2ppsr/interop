#!/usr/bin/env python3
"""Verify federated tenant isolation without provisioning a paid device."""
import json
import os
from pathlib import Path
import subprocess
import urllib.error
import urllib.request


def google(path):
    request = urllib.request.Request(path, headers={
        'Authorization': 'Bearer ' + os.environ['GOOGLE_ACCESS_TOKEN'],
        'x-goog-user-project': os.environ['DEVICE_PROJECT'],
    })
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as exc:
        return exc.code, {}


def aws(*args):
    return subprocess.run(['aws', '--region', 'us-west-2', *args, '--output', 'json', '--no-cli-pager'],
                          capture_output=True, text=True, timeout=45)


def main():
    identity = aws('sts', 'get-caller-identity')
    if identity.returncode: raise RuntimeError('AWS federation failed')
    account = json.loads(identity.stdout)
    expected = 'arn:aws:sts::380794909093:assumed-role/babbage-device-lab-' + os.environ['TENANT'] + '-ci/'
    assert account['Account'] == '380794909093' and account['Arn'].startswith(expected)
    own = aws('devicefarm', 'get-project', '--arn', os.environ['AWS_PROJECT_ARN'])
    assert own.returncode == 0
    other = aws('devicefarm', 'get-project', '--arn', os.environ['OTHER_AWS_PROJECT_ARN'])
    assert other.returncode != 0 and 'AccessDenied' in other.stderr
    status, _ = google('https://devicestreaming.googleapis.com/v1/projects/' + os.environ['DEVICE_PROJECT'] + '/deviceSessions')
    assert status == 200
    status, _ = google('https://devicestreaming.googleapis.com/v1/projects/' + os.environ['OTHER_DEVICE_PROJECT'] + '/deviceSessions')
    assert status == 403
    status, ledger = google('https://storage.googleapis.com/storage/v1/b/babbage-device-lab-control/o/ledger.json?alt=media')
    assert status == 200 and ledger['capCents'] == 7500
    result = {'classification': 'INFRASTRUCTURE_IDENTITY_ONLY', 'tenant': os.environ['TENANT'],
              'sourceSha': os.environ['GITHUB_SHA'], 'runId': os.environ['GITHUB_RUN_ID'],
              'awsFederation': 'PASS', 'gcpFederation': 'PASS', 'ownProjectAccess': 'PASS',
              'crossTenantProjectDenial': 'PASS', 'sharedLedgerRead': 'PASS', 'paidDevicesCreated': 0}
    Path('shared-device-identity.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result))


if __name__ == '__main__': main()
