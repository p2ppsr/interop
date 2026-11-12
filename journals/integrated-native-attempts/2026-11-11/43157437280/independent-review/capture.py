import concurrent.futures, datetime, hashlib, json, pathlib, subprocess

run_id = 43157437280
source = '585211c193d0288effeb466bda38fe6ef23ac94d'
root = pathlib.Path(__file__).resolve().parent
stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S.%fZ')
directory = root / 'api' / stamp
directory.mkdir(parents=True, exist_ok=False)
base = f'repos/p2ppsr/interop/actions/runs/{run_id}'
endpoints = {'run': base, 'jobs': base + '/jobs?per_page=100&filter=all', 'artifacts': base + '/artifacts?per_page=100'}

def acquire(item):
    name, endpoint = item
    child = subprocess.run(['gh', 'api', endpoint], capture_output=True)
    (directory / (name + '.json')).write_bytes(child.stdout)
    (directory / (name + '.stderr.log')).write_bytes(child.stderr)
    if child.returncode: raise RuntimeError(f'{name}: gh exited {child.returncode}')
    return name, json.loads(child.stdout)

with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
    data = dict(pool.map(acquire, endpoints.items()))
assert data['run']['head_sha'] == source
assert data['run']['id'] == run_id and data['run']['event'] == 'workflow_dispatch'
assert data['jobs']['total_count'] == len(data['jobs']['jobs'])
assert data['artifacts']['total_count'] == len(data['artifacts']['artifacts'])
receipt = {'capturedAt': stamp, 'run': run_id, 'source': source, 'status': data['run']['status'], 'conclusion': data['run']['conclusion'], 'jobStatus': [{'id': x['id'], 'name': x['name'], 'status': x['status'], 'conclusion': x['conclusion'], 'currentStep': [s['name'] for s in x.get('steps', []) if s['status'] == 'in_progress']} for x in data['jobs']['jobs']], 'artifacts': [{'id': x['id'], 'name': x['name'], 'digest': x.get('digest')} for x in data['artifacts']['artifacts']], 'receipts': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in directory.iterdir() if p.is_file()}}
if data['run']['status'] == 'completed':
    seconds = 0
    for job in data['jobs']['jobs']:
        if job['conclusion'] == 'skipped': continue
        start = datetime.datetime.fromisoformat(job['started_at'].replace('Z', '+00:00'))
        end = datetime.datetime.fromisoformat(job['completed_at'].replace('Z', '+00:00'))
        seconds += (end - start).total_seconds()
        child = subprocess.run(['gh', 'api', f'repos/p2ppsr/interop/actions/jobs/{job["id"]}/logs'], capture_output=True)
        (directory / f'job-{job["id"]}.log').write_bytes(child.stdout)
        (directory / f'job-{job["id"]}.stderr.log').write_bytes(child.stderr)
        assert child.returncode == 0, 'Complete job logs unavailable; retained error'
    receipt['completedJobWallSeconds'] = seconds
    receipt['actualMoneyUSD'] = None
    receipt['operatorEffortUSD'] = None
    receipt['developmentAgentUsageUSD'] = None
    receipt['allocatedOwnedCapacityUSD'] = None
receipt['receipts'] = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in directory.iterdir() if p.is_file()}
(directory / 'capture.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps({'directory': str(directory), **receipt}, indent=2))
