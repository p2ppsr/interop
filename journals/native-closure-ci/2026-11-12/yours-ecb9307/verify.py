from pathlib import Path
import json,hashlib,gzip,zipfile,datetime
r=Path(__file__).resolve().parent;s=lambda b:hashlib.sha256(b).hexdigest();m=json.loads((r/'manifest.json').read_text())
assert sorted(x['path']for x in m['files'])==sorted(p.relative_to(r).as_posix()for p in r.rglob('*')if p.is_file()and p.name!='manifest.json')
for x in m['files']:
 p=r/x['path'];assert not Path(x['path']).is_absolute()and'..'not in Path(x['path']).parts;assert len(p.read_bytes())==x['bytes']and s(p.read_bytes())==x['sha256']
d=json.loads((r/'summary.json').read_text());a=json.loads((r/'run.json').read_text());j=json.loads((r/'jobs.json').read_text())['jobs'];assert len(j)==1;assert a['id']==43227590041 and a['head_sha']==d['source']=='ecb93072a2230a6b1ef12011ef74e1d0af215dd2'and a['conclusion']=='failure'and a['run_attempt']==1
assert json.loads((r/'artifacts.json').read_text())['artifacts']==[];assert d['candidateArtifactProduced']is False and d['nativeQualification']is False and d['actualJobSeconds']==51 and d['completedCohortAfter']==25008 and d['unknownCostsAreZero']is False
assert all(d[k]is None for k in ['actualCIChargeUSD','operatorCostUSD','agentCostUSD','allocatedCapacityUSD','storageEgressUSD','totalFullCostUSD'])
t=lambda v:datetime.datetime.fromisoformat(v.replace('Z','+00:00'));assert(t(j[0]['completed_at'])-t(j[0]['started_at'])).total_seconds()==51
raw=gzip.decompress((r/d['rawJobLog']['path']).read_bytes());assert len(raw)==d['rawJobLog']['uncompressedBytes']and s(raw)==d['rawJobLog']['uncompressedSha256'];log=raw.decode();assert all(x in log for x in ['No usable sandbox!','261 pass','3 fail','1 error','1769 expect() calls','Ran 264 tests across 16 files.'])
with zipfile.ZipFile(r/'run-logs.zip')as z:assert z.testzip()is None and any(z.read(n)==raw for n in z.namelist()if not n.endswith('/'))
a=json.loads((r/'source-head-commit.json').read_text());b=json.loads((r/'built-merge-commit.json').read_text());assert a['tree']==b['tree']and b['parents'][1]['sha']==d['source']and b['sha']==d['checkout']['sha'];assert b['sha']in log
print(json.dumps({'verified':True,'claim':'FAILED_CI_BROWSER_OBSERVER_STARTUP','jobSeconds':51,'cohortJobSeconds':25008,'artifacts':0,'nativeQualification':False}))
