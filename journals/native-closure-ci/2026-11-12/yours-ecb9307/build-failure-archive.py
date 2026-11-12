from pathlib import Path
import json,gzip,hashlib,zipfile,datetime,subprocess
r=Path(__file__).resolve().parent;repo=r.parents[2];d=repo/'journals/native-closure-ci/2026-11-12/yours-ecb9307';assert not d.exists();d.mkdir(parents=True);sha=lambda b:hashlib.sha256(b).hexdigest();source='ecb93072a2230a6b1ef12011ef74e1d0af215dd2'
run=json.loads((r/'run.json').read_text());jobs=json.loads((r/'jobs.json').read_text());arts=json.loads((r/'artifacts.json').read_text());a=json.loads((r/'source-head-commit.json').read_text());b=json.loads((r/'built-merge-commit.json').read_text());assert a['tree']==b['tree']and b['parents'][1]['sha']==source;assert run['conclusion']=='failure'and arts['total_count']==0
job=jobs['jobs'][0];dt=lambda x:datetime.datetime.fromisoformat(x.replace('Z','+00:00'));assert(dt(job['completed_at'])-dt(job['started_at'])).total_seconds()==51
for n in ['run-first.json','jobs-first.json','run.json','jobs.json','artifacts.json','source-head-commit.json','built-merge-commit.json','run-logs.zip']:(d/n).write_bytes((r/n).read_bytes())
raw=(r/'job-131214687836.log').read_bytes();(d/'job-131214687836.log.gz').write_bytes(gzip.compress(raw,mtime=0))
with zipfile.ZipFile(r/'run-logs.zip')as z:assert z.testzip()is None and any(z.read(n)==raw for n in z.namelist()if not n.endswith('/'))
yours=Path('/Users/tyeverett/tmp/network-ops/worktrees/ty-everett/yours-wallet/codex/ghsa-5vmp-dependency-upgrade')
for n in ['src/prompt-queue.browser.test.ts','.github/actions/build-extension/action.yml','.github/workflows/ci.yml']:
 p=d/'source'/n;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(subprocess.check_output(['git','show',source+':'+n],cwd=yours))
summary={'schema':'tpnil-wallet-candidate-failed-ci@1','source':source,'run':43227590041,'job':131214687836,'claim':'FAILED_CI_BROWSER_OBSERVER_STARTUP','nativeQualification':False,'candidateArtifactProduced':False,'artifactCount':0,'tests':{'passed':261,'failed':3,'errors':1,'expectations':1769,'declaredTests':264,'files':16,'browserBehaviorExecuted':False},'cause':'Chromium155 aborted before browser tests: No usable sandbox! Ubuntu user namespace/AppArmor host configuration.','actualJobSeconds':51,'completedCohortBefore':24957,'completedCohortAfter':25008,'actualCIChargeUSD':None,'operatorCostUSD':None,'agentCostUSD':None,'allocatedCapacityUSD':None,'storageEgressUSD':None,'totalFullCostUSD':None,'unknownCostsAreZero':False,'workOrder':{'commit':'6309fb3b3fdc4087c3f117f925d47393f50fd908','sha256':'5cf3d87812c9d32281164597e422dc4da0bbf308bc21647511f8a8b940ab1bc0','maximumJobSeconds':900,'deadline':'2026-11-12T13:52:47.753760Z'},'checkout':{'sha':b['sha'],'sourceAndMergeTreesEqual':True,'tree':a['tree']['sha']},'rawJobLog':{'path':'job-131214687836.log.gz','uncompressedBytes':len(raw),'uncompressedSha256':sha(raw)}}
(d/'summary.json').write_text(json.dumps(summary,indent=2)+'\n');(r/'closeout.json').write_text(json.dumps(summary,indent=2)+'\n')
(d/'README.md').write_text('''# Yours PR368 ecb9307 failed CI

Run43227590041 failed before the three browser regression tests could execute:
Chromium155 reported “No usable sandbox!” and aborted during launch. The existing
261 tests passed; the three new tests failed from one shared startup error.
There is no candidate artifact, native result or browser behavior conclusion.
The exact source and synthetic merge trees match. Raw API and complete job/run
logs are retained. The job consumed51seconds; cohort total25008seconds. Full
monetary costs remain unknown. Recovery must preserve the Chromium sandbox.
Run python3 verify.py for retained evidence and scope checks.
''')
(d/'verify.py').write_text('''from pathlib import Path
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
''')
(d/'build-failure-archive.py').write_bytes(Path(__file__).read_bytes());m={'schema':'tpnil-ci-failure-archive@1','source':source,'run':43227590041,'files':[{'path':p.relative_to(d).as_posix(),'bytes':p.stat().st_size,'sha256':sha(p.read_bytes())}for p in sorted(d.rglob('*'))if p.is_file()]};(d/'manifest.json').write_text(json.dumps(m,indent=2)+'\n');print(json.dumps({'path':str(d),'files':len(m['files']),'manifestSha256':sha((d/'manifest.json').read_bytes())}))
