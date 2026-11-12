from pathlib import Path
import argparse,hashlib,json,subprocess,sys
p=argparse.ArgumentParser();p.add_argument('archive');args=p.parse_args();root=Path(args.archive).resolve();sha=lambda b:hashlib.sha256(b).hexdigest();raw=(root/'manifest.json').read_bytes();assert sha(raw)=='07f6aaa98f1ab6713fdd5e51c04b6b650df23a6783fb225abdffe85404810d0f','CI archive manifest differs from exact externally reviewed receipt';m=json.loads(raw);assert {r['path']for r in m['files']if r.get('generated')}=={'README.md','verify.py'}
for r in m['files']:
 f=root/r['path'];assert f.is_file()and not f.is_symlink();b=f.read_bytes();assert len(b)==r['bytes']and sha(b)==r['sha256']
assert {p.relative_to(root).as_posix()for p in root.rglob('*')if p.is_file()or p.is_symlink()}=={r['path']for r in m['files']}|{'manifest.json'}
r=subprocess.run([sys.executable,str(root/'verify.py')],check=True,capture_output=True,text=True);d=json.loads(r.stdout);assert d['verified']is True;print(json.dumps({'verified':True,'externalManifestPinned':True,'source':m['source'],'ciJobSeconds':d['ciJobSeconds'],'nativeQualification':False}))
