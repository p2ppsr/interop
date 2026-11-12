from pathlib import Path
import concurrent.futures,subprocess,json,hashlib,datetime
base=Path(__file__).resolve().parent
jobs=[]
for run in [43165476505,43165476571]:
 d=base/str(run);jobs.append((d/'run-logs.zip',f'repos/p2ppsr/interop/actions/runs/{run}/logs',None))
 for j in json.loads((d/'jobs.json').read_text())['jobs']:jobs.append((d/f"job-{j['id']}.log",f"repos/p2ppsr/interop/actions/jobs/{j['id']}/logs",None))
 for a in json.loads((d/'artifacts.json').read_text())['artifacts']:jobs.append((d/f"artifact-{a['id']}.zip",f"repos/p2ppsr/interop/actions/artifacts/{a['id']}/zip",a['digest']))
def capture(item):
 p,url,digest=item
 assert not p.exists(),p
 data=subprocess.check_output(['gh','api',url]);h='sha256:'+hashlib.sha256(data).hexdigest()
 if digest:assert h==digest,(p,h,digest)
 p.write_bytes(data)
 return {'path':str(p.relative_to(base)),'bytes':len(data),'sha256':h.removeprefix('sha256:'),'githubDigestVerified':bool(digest)}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:receipts=list(pool.map(capture,jobs))
(base/'acquisition.json').write_text(json.dumps({'schema':'tpnil-completed-ci-acquisition@1','createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'files':receipts},indent=2)+'\n')
print(json.dumps(receipts))
