from pathlib import Path
import concurrent.futures,subprocess,json,hashlib,datetime,sys,zipfile
base=Path(__file__).resolve().parent
source='1f9fe0f9b979e9bbca66e90335f02ba2b80c7d41'
sha=lambda b:hashlib.sha256(b).hexdigest()
for run in map(int,sys.argv[1:]):
 d=base/str(run);d.mkdir(exist_ok=True)
 def api(endpoint):
 import re,hashlib,os
 command=['gh','api',endpoint]
 try:
  result=subprocess.run(command,capture_output=True,timeout=55)
  if result.returncode==0:return result.stdout
  error=subprocess.CalledProcessError(result.returncode,command)
  stderr=result.stderr
 except subprocess.TimeoutExpired as failure:
  error=failure;stderr=failure.stderr or b''
 text=stderr.decode(errors='replace');stamp=str(__import__('time').time_ns())
 if 'sig='in text:
  private=Path('/Users/tyeverett/tmp/network-ops/private-transport-1f9fe0f');private.mkdir(mode=0o700,exist_ok=True);raw=private/(stamp+'.stderr');raw.write_bytes(stderr);os.chmod(raw,0o600)
 redacted=re.sub(r'(https://[^\s"?]+)\?[^\s"]+',r'\1?[DOWNLOAD_QUERY_REDACTED]',text)
 (base/('api-transport-'+stamp+'.json')).write_text(json.dumps({'endpoint':endpoint,'failure':type(error).__name__,'stderr':redacted,'rawStderrSha256':hashlib.sha256(stderr).hexdigest(),'privateOriginalOutsideRepository':'sig='in text,'workflowRetry':False},indent=2)+'\n')
 raise error
 raws={k:api(f'repos/p2ppsr/interop/actions/runs/{run}{suffix}')for k,suffix in [('run',''),('jobs','/jobs?per_page=100'),('artifacts','/artifacts?per_page=100')]}
 meta={k:json.loads(v)for k,v in raws.items()}
 assert meta['run']['head_sha']==source and meta['run']['status']=='completed' and meta['run']['run_attempt']==1
 assert meta['jobs']['total_count']==len(meta['jobs']['jobs']) and meta['artifacts']['total_count']==len(meta['artifacts']['artifacts'])
 for k,data in raws.items():
  p=d/f'{k}-api.json'
  if not p.exists():p.write_bytes(data)
  else:assert json.loads(p.read_bytes())==json.loads(data),(p,'terminal API changed; retain a new snapshot instead')
 tasks=[(d/'run-logs.zip',f'repos/p2ppsr/interop/actions/runs/{run}/logs',None)]
 tasks += [(d/f"job-{j['id']}.log",f"repos/p2ppsr/interop/actions/jobs/{j['id']}/logs",None)for j in meta['jobs']['jobs']]
 tasks += [(d/f"artifact-{a['id']}.zip",f"repos/p2ppsr/interop/actions/artifacts/{a['id']}/zip",a)for a in meta['artifacts']['artifacts']]
 def capture(task):
  p,url,a=task
  if p.exists():data=p.read_bytes()
  else:
   data=api(url)
   if a:assert 'sha256:'+sha(data)==a['digest'] and len(data)==a['size_in_bytes'],p
   p.write_bytes(data)
  h=sha(data)
  if a:assert 'sha256:'+h==a['digest'] and len(data)==a['size_in_bytes'],p
  row={'path':p.name,'bytes':len(data),'sha256':h,'githubDigestVerified':bool(a)}
  if a:
   seen=set();members=[];expanded=0
   with zipfile.ZipFile(p) as z:
    for m in z.infolist():
     expanded+=m.file_size;assert len(z.infolist())<=100000 and m.file_size<=256*1024*1024 and expanded<=512*1024*1024
     name=Path(m.filename);assert not name.is_absolute() and '..' not in name.parts and m.filename not in seen;seen.add(m.filename)
     assert (m.external_attr>>16)&0o170000!=0o120000
     if m.is_dir():continue
     b=z.read(m);members.append({'path':m.filename,'bytes':len(b),'sha256':sha(b),'crc32':m.CRC})
   row['artifactId']=a['id'];row['artifactName']=a['name'];row['members']=members
  return row
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:receipts=list(pool.map(capture,tasks))
 p=d/'acquisition.json';result={'schema':'tpnil-completed-ci-acquisition@1','source':source,'run':run,'conclusion':meta['run']['conclusion'],'capturedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'files':receipts,'apis':[{'path':f'{k}-api.json','bytes':(d/f'{k}-api.json').stat().st_size,'sha256':sha((d/f'{k}-api.json').read_bytes())}for k in raws]}
 assert not p.exists(),p;p.write_text(json.dumps(result,indent=2)+'\n')
 print(json.dumps({'run':run,'conclusion':result['conclusion'],'files':len(receipts),'artifacts':len(meta['artifacts']['artifacts']),'members':sum(len(x.get('members',[]))for x in receipts),'receiptSha256':sha(p.read_bytes())}))
