# LAB_SELF_TEST_ONLY: mutates disposable archive copies, never original evidence.
from pathlib import Path
import tempfile,shutil,subprocess,json,hashlib,gzip
root=Path(__file__).resolve().parent
sha=lambda b:hashlib.sha256(b).hexdigest()
def rehash(d):
 p=d/'attempt.json';m=json.loads(p.read_text());m['files']=[{'name':f.relative_to(d).as_posix(),'size':f.stat().st_size,'sha256':sha(f.read_bytes())}for f in sorted(d.rglob('*'))if f.is_file()and f!=p];p.write_text(json.dumps(m,indent=2)+'\n')
def edit(d,name,change):
 p=d/name;x=json.loads(p.read_text());change(x);p.write_text(json.dumps(x,indent=2)+'\n')
def require_rejection(name,change,rehash_inventory=True):
 with tempfile.TemporaryDirectory(prefix='tpnil-attempt4-guard-')as t:
  d=Path(t)/'archive';shutil.copytree(root,d);change(d)
  if rehash_inventory:rehash(d)
  result=subprocess.run(['python3',str(d/'verify.py')],capture_output=True,text=True);assert result.returncode!=0,f'Mutation falsely accepted: {name}'
 return name
baseline=subprocess.run(['python3',str(root/'verify.py')],capture_output=True,text=True);assert baseline.returncode==0,baseline.stderr
passed=[]
passed.append(require_rejection('claim promotion',lambda d:edit(d,'attempt.json',lambda m:m.update(claim='OBSERVER_EXECUTION_ERROR'))))
passed.append(require_rejection('qualified flag promotion',lambda d:edit(d,'attempt.json',lambda m:m.update(qualifiedEnvironment=True))))
passed.append(require_rejection('candidate relabeled official',lambda d:edit(d,'attempt.json',lambda m:m.update(officialRelease=True))))
passed.append(require_rejection('deleted original member with rebuilt inventory',lambda d:(d/'original/repetition-2/record.json').unlink()))
passed.append(require_rejection('raw verdict rewritten with rebuilt inventory',lambda d:edit(d,'original/repetition-1/record.json',lambda m:m['vectors'][0]['assertions'][0].update(outcome='FAIL'))))
passed.append(require_rejection('fabricated qualification',lambda d:(d/'original/qualification.json').write_text('{"qualifiedEnvironment":true}\n')))
passed.append(require_rejection('diagnostic99 falsely complete',lambda d:edit(d,'diagnosis.json',lambda m:m.update(original99Outcomes={'PASS':99,'FAIL':0,'BLOCKED':0}))))
passed.append(require_rejection('unknown cost made zero',lambda d:edit(d,'cost.json',lambda m:m.update(actualCIChargeUSD=0))))
passed.append(require_rejection('original ZIP corruption',lambda d:(d/'native-integrated.zip').write_bytes((d/'native-integrated.zip').read_bytes()+b'x')))
print(json.dumps({'claim':'LAB_SELF_TEST_ONLY','mutatedOriginalArchive':False,'positiveIntegrityControl':'PASS','rejectedMutations':passed,'testsPassed':len(passed)+1}))
