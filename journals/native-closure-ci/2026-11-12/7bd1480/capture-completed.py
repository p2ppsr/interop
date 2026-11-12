from pathlib import Path
import concurrent.futures,subprocess,json,hashlib,datetime,sys,zipfile
base=Path(__file__).resolve().parent
source='7bd1480037ddc064f5a8cb2f567f6e58285c5999'
sha=lambda b:hashlib.sha256(b).hexdigest()
for run in map(int,sys.argv[1:]):
 d=base/str(run);d.mkdir(exist_ok=True)
 def api(endpoint):return subprocess.check_output(['gh','api',endpoint])
 raws={k:api(f'repos/p2ppsr/interop/actions/runs/{run}{suffix}')for k,suffix in [('run',''),('jobs','/jobs?per_page=100'),('artifacts','/artifacts?per_page=100')]}
 meta={k:json.loads(v)for k,v in raws.items()}
 assert meta['run']['head_sha']==source and meta['run']['status']=='completed' and meta['run']['run_attempt']==1
 assert meta['jobs']['total_count']==len(meta['jobs']['jobs']) and meta['artifacts']['total_count']==len(meta['artifacts']['artifacts'])
 for k,data in raws.items():
  p=d/f'{k}.json'
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
   seen=set();members=[]
   with zipfile.ZipFile(p) as z:
    for m in z.infolist():
     name=Path(m.filename);assert not name.is_absolute() and '..' not in name.parts and m.filename not in seen;seen.add(m.filename)
     assert (m.external_attr>>16)&0o170000!=0o120000
     if m.is_dir():continue
     b=z.read(m);members.append({'path':m.filename,'bytes':len(b),'sha256':sha(b),'crc32':m.CRC})
   row['artifactId']=a['id'];row['artifactName']=a['name'];row['members']=members
  return row
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:receipts=list(pool.map(capture,tasks))
 p=d/'acquisition.json';result={'schema':'tpnil-completed-ci-acquisition@1','source':source,'run':run,'conclusion':meta['run']['conclusion'],'capturedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'files':receipts,'apis':[{'path':f'{k}.json','bytes':(d/f'{k}.json').stat().st_size,'sha256':sha((d/f'{k}.json').read_bytes())}for k in raws]}
 assert not p.exists(),p;p.write_text(json.dumps(result,indent=2)+'\n')
 print(json.dumps({'run':run,'conclusion':result['conclusion'],'files':len(receipts),'artifacts':len(meta['artifacts']['artifacts']),'members':sum(len(x.get('members',[]))for x in receipts),'receiptSha256':sha(p.read_bytes())}))
