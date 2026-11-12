from pathlib import Path
import hashlib,json,shutil,subprocess,sys,tempfile
base=Path(__file__).resolve().parent;root=base.parents[2];archive=root/'journals/native-closure-ci/2026-11-12/69386ef';out=base/'archive-control-results';out.mkdir(exist_ok=False)
manifest=json.loads((archive/'manifest.json').read_bytes());originalSha=hashlib.sha256((archive/'manifest.json').read_bytes()).hexdigest();rows=[]
def run(case,mutate):
 with tempfile.TemporaryDirectory(prefix='tpnil-ci-archive-control-')as td:
  d=Path(td)/'archive';shutil.copytree(archive,d);before=(d/'manifest.json').read_bytes();mutate(d)
  if case!='positive':assert before!=(d/'manifest.json').read_bytes()or any(p.read_bytes()!=(archive/p.relative_to(d)).read_bytes() for p in d.rglob('*')if p.is_file()and(archive/p.relative_to(d)).is_file())or{p.relative_to(d)for p in d.rglob('*')if p.is_file()}!={p.relative_to(archive)for p in archive.rglob('*')if p.is_file()},'Mutation was no-op'
  r=subprocess.run([sys.executable,str(d/'verify.py')],capture_output=True,timeout=60);(out/f'{case}.stdout').write_bytes(r.stdout);(out/f'{case}.stderr').write_bytes(r.stderr);assert (r.returncode==0)==(case=='positive'),case;rows.append({'case':case,'expected':'PASS'if case=='positive'else'REJECT','exitCode':r.returncode})
def manifestEdit(d,f):
 p=d/'manifest.json';v=json.loads(p.read_bytes());f(v);p.write_text(json.dumps(v,indent=2)+'\n')
run('positive',lambda d:None)
run('omit-raw-job-log',lambda d:manifestEdit(d,lambda m:m['files'].__setitem__(slice(None),[r for r in m['files']if 'job-131292196465.log'not in r['path']])))
run('omit-review-receipt',lambda d:manifestEdit(d,lambda m:m['files'].__setitem__(slice(None),[r for r in m['files']if 'independent-intake-review.json'in r['path']][:0]+[r for r in m['files']if 'independent-intake-review.json'not in r['path']])))
run('native-qualification-added',lambda d:manifestEdit(d,lambda m:m.__setitem__('nativeQualification',True)))
run('source-downgrade',lambda d:manifestEdit(d,lambda m:m.__setitem__('source','0'*40)))
run('extra-physical-file',lambda d:(d/'unindexed.txt').write_text('not admitted'))
ziprow=next(r for r in manifest['files']if r['path'].endswith('.zip'))
run('original-zip-byte-tamper',lambda d:(d/ziprow['path']).write_bytes((d/ziprow['path']).read_bytes()+b'bad'))
run('readme-false-claim',lambda d:(d/'README.md').write_text('Complete native conformance achieved.'))
assert hashlib.sha256((archive/'manifest.json').read_bytes()).hexdigest()==originalSha
result={'schema':'tpnil-ci-archive-controls@1','verified':True,'archiveManifestSha256':originalSha,'positive':1,'negative':len(rows)-1,'controls':rows,'scope':'Archive byte/inventory/claim admission controls only; no additional native or semantic execution','nativeQualification':False};p=out/'review.json';p.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'verified':True,'controls':len(rows),'reviewSha256':hashlib.sha256(p.read_bytes()).hexdigest()}))
