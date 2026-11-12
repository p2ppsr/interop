from pathlib import Path
import argparse,hashlib,json,subprocess,sys
p=argparse.ArgumentParser();p.add_argument('--archive');p.add_argument('--repository');a=p.parse_args();root=Path(a.archive).resolve()if a.archive else Path(__file__).resolve().parent;repo=Path(a.repository).resolve()if a.repository else next(x for x in root.parents if(x/'.git').exists());sha=lambda b:hashlib.sha256(b).hexdigest();m=json.loads((root/'manifest.json').read_bytes());rows=[e for e in m['files']if e['path']!='verify.py'];assert sha(json.dumps(rows,sort_keys=True,separators=(',',':')).encode())=='97082953eed1833b60a6c6ff29a8a62b5f9649cff40e60e82accc1c6888fe235';assert len(m['files'])==len(rows)+1 and len({e['path']for e in m['files']})==len(m['files']);assert (root/'verify.py').read_bytes()==Path(__file__).read_bytes()
for e in m['files']:
 f=root/e['path'];assert f.is_file()and not f.is_symlink();b=f.read_bytes();assert len(b)==e['bytes']and sha(b)==e['sha256']
assert {f.name for f in root.iterdir()}=={e['path']for e in m['files']}|{'manifest.json'}
assert m['originalManifestSha256']=='07f6aaa98f1ab6713fdd5e51c04b6b650df23a6783fb225abdffe85404810d0f'and m['nativeQualification']is False
r=json.loads((root/'review.json').read_bytes());assert r['accepted']is True and r['originalArchiveUnchanged']is True
r=json.loads((root/'pinned-review.json').read_bytes());assert r['verified']is True and r['positive']==1 and r['negative']==1
assert b'externally reviewed receipt'in(root/'pinned-negative.stderr').read_bytes()
q=subprocess.run([sys.executable,str(root/'verify-pinned-ci.py'),str(repo/'journals/native-closure-ci/2026-11-12/69386ef')],capture_output=True,text=True);assert q.returncode==0,q.stderr;assert json.loads(q.stdout)['externalManifestPinned']is True
print(json.dumps({'verified':True,'files':len(m['files']),'positive':1,'negative':1,'originalCIArchiveUnchanged':True,'nativeQualification':False}))
