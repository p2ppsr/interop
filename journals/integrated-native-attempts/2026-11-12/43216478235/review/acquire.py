from pathlib import Path
import subprocess,json,datetime,hashlib,zipfile,concurrent.futures,re,os,sys
base=Path(__file__).resolve().parent;directory=base/'acquisition';directory.mkdir(exist_ok=True)
run=43216478235;source='1f9fe0f9b979e9bbca66e90335f02ba2b80c7d41';sha=lambda b:hashlib.sha256(b).hexdigest()
assert not (directory/'acquisition.json').exists(),'Completed acquisition is immutable'
files=[]
def acquire(endpoint,name):
 p=directory/name
 if p.exists():data=p.read_bytes()
 else:
  try:r=subprocess.run(['gh','api',endpoint],capture_output=True,timeout=55)
  except subprocess.TimeoutExpired as error:r=None;stderr=error.stderr or b''
  else:stderr=r.stderr
  if r is None or r.returncode:
   stamp=str(__import__('time').time_ns());text=stderr.decode(errors='replace');privateOriginal=False
   if 'sig=' in text:
    private=Path('/Users/tyeverett/tmp/network-ops/private-transport-native6');private.mkdir(mode=0o700,exist_ok=True);q=private/(stamp+'.stderr');q.write_bytes(stderr);os.chmod(q,0o600);privateOriginal=True
   redacted=re.sub(r'(https://[^\s"?]+)\?[^\s"]+',r'\1?[DOWNLOAD_QUERY_REDACTED]',text)
   (base/('acquisition-transport-'+stamp+'.json')).write_text(json.dumps({'endpoint':endpoint,'stderr':redacted,'rawStderrSha256':sha(stderr),'privateOriginalOutsideRepository':privateOriginal,'workflowRetry':False},indent=2)+'\n')
   raise RuntimeError('Read-only acquisition failed for '+name+'; transport receipt retained')
  data=r.stdout;p.write_bytes(data)
 row={'path':name,'bytes':len(data),'sha256':sha(data),'endpoint':endpoint};files.append(row);return data
started=datetime.datetime.now(datetime.timezone.utc).isoformat()
receipt={'schema':'tpnil-native-attempt-original-acquisition@1','runId':run,'source':source,'startedAt':started,'files':files,'result':'NOT_VERIFIED'}
try:
 r=json.loads(acquire(f'repos/p2ppsr/interop/actions/runs/{run}','run.json'));assert r['head_sha']==source and r['status']=='completed' and r['event']=='workflow_dispatch' and r['run_attempt']==1
 receipt.update(conclusion=r['conclusion'],workflowUrl=r['html_url'])
 jobs=json.loads(acquire(f'repos/p2ppsr/interop/actions/runs/{run}/jobs?per_page=100','jobs.json'));assert jobs['total_count']==len(jobs['jobs']) and {j['name']for j in jobs['jobs']}=={'all-go-native','yours-wallet'}
 assert all(j['status']=='completed'for j in jobs['jobs']) and all(j['conclusion']=='skipped'for j in jobs['jobs']if j['name']=='yours-wallet')
 a=json.loads(acquire(f'repos/p2ppsr/interop/actions/runs/{run}/artifacts?per_page=100','artifacts.json'));assert a['total_count']==len(a['artifacts'])
 selected=[x for x in a['artifacts']if x['name']=='native-go-yours-wallet-pr368-coverage2'];assert len(selected)==1,'Expected native original artifact is absent or ambiguous'
 artifact=selected[0];assert not artifact['expired']
 tasks=[(f'repos/p2ppsr/interop/actions/runs/{run}/logs','all-job-logs.zip')]+[(f"repos/p2ppsr/interop/actions/jobs/{j['id']}/logs",f"job-{j['id']}.log")for j in jobs['jobs']if j['conclusion']!='skipped']
 tasks += [(f"repos/p2ppsr/interop/actions/artifacts/{x['id']}/zip",'original-native.zip'if x['id']==artifact['id']else f"artifact-{x['id']}.zip")for x in a['artifacts']]
 with concurrent.futures.ThreadPoolExecutor(max_workers=3)as pool:list(pool.map(lambda t:acquire(*t),tasks))
 integrity=[]
 for x in a['artifacts']:
  name='original-native.zip'if x['id']==artifact['id']else f"artifact-{x['id']}.zip";p=directory/name;data=p.read_bytes();assert x['digest']=='sha256:'+sha(data)and x['size_in_bytes']==len(data)
  with zipfile.ZipFile(p)as z:
   assert z.testzip()is None;seen=set();members=[];expanded=0
   for m in z.infolist():
    path=Path(m.filename);assert path.as_posix()==m.filename.rstrip('/');assert not path.is_absolute()and'..'not in path.parts and'\\'not in m.filename and m.filename not in seen;seen.add(m.filename);assert (m.external_attr>>16)&0o170000!=0o120000
    expanded+=m.file_size;assert len(seen)<=10000 and m.file_size<=256*1024*1024 and expanded<=512*1024*1024
    if not m.is_dir():
     raw=z.read(m);members.append({'path':m.filename,'bytes':len(raw),'sha256':sha(raw)})
   integrity.append({'path':name,'artifactId':x['id'],'githubDigest':x['digest'],'githubDigestVerified':True,'crc':'PASS','members':members,'expandedBytes':expanded})
 with zipfile.ZipFile(directory/'all-job-logs.zip')as z:assert z.testzip()is None
 receipt.update(artifact={'id':artifact['id'],'name':artifact['name'],'githubDigest':artifact['digest'],'githubDigestVerified':True},zipIntegrity=integrity,result='ORIGINAL_BYTES_VERIFIED')
 ts=lambda s:datetime.datetime.fromisoformat(s.replace('Z','+00:00'))
 receipt['jobs']=[{'id':j['id'],'name':j['name'],'conclusion':j['conclusion'],'startedAt':j['started_at'],'completedAt':j['completed_at'],'jobSeconds':0 if j['conclusion']=='skipped'else int((ts(j['completed_at'])-ts(j['started_at'])).total_seconds())}for j in jobs['jobs']]
 receipt['actualJobSeconds']=sum(j['jobSeconds']for j in receipt['jobs'])
except Exception as error:
 receipt['failure']={'type':type(error).__name__,'message':str(error)};receipt['completedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();p=base/('acquisition-failure-'+str(__import__('time').time_ns())+'.json');p.write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'result':'ACQUISITION_INCOMPLETE','receipt':str(p),'errorType':type(error).__name__}));raise
receipt['completedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();receipt['files']=sorted(files,key=lambda r:r['path']);p=directory/'acquisition.json';p.write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'result':receipt['result'],'runId':run,'conclusion':receipt['conclusion'],'artifact':receipt['artifact'],'files':len(files),'members':sum(len(x['members'])for x in receipt['zipIntegrity']),'jobSeconds':receipt['actualJobSeconds'],'receiptSha256':sha(p.read_bytes())}))
