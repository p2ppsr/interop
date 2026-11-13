from pathlib import Path
import subprocess,json,hashlib,os
r=Path.cwd();home=r/'out/source19-replay';target=home/'source';source='ec3a554d433845e9aa8209d9eb20dde48cba6a2a';selection=['package.json', '.nvmrc', '.github', 'scripts', 'synthesis', 'infra', 'fixtures', 'components', 'integrations', 'itcves', 'programs', 'config', 'src', 'bin', 'adapters', 'schemas', 'suts', 'test', 'docs'];rows=[]
for entry in subprocess.check_output(['git','ls-tree','-r','-l','-z',source,'--',*selection]).split(b'\0'):
 if not entry:continue
 metadata,name=entry.split(b'\t',1);mode,kind,oid,size=metadata.decode().split();name=name.decode();p=target/name;assert p.is_file()and not p.is_symlink(),name;b=p.read_bytes();assert len(b)==int(size)and hashlib.sha1(f'blob {len(b)}\0'.encode()+b).hexdigest()==oid,name;os.chmod(p,0o755 if mode=='100755'else 0o644);rows.append({'path':name,'bytes':len(b),'mode':mode,'gitBlob':oid,'sha256':hashlib.sha256(b).hexdigest()})
plan=json.loads((target/'infra/native/conformance/plan-pr368-coverage-6-source-9.json').read_bytes());indexed={x['path']:x['sha256']for x in rows};assert all(indexed[n]==h for n,h in plan['conformanceInputs'].items())
(home/'source-inventory.json').write_text(json.dumps({'source':source,'canonicalRoot':str(target),'files':rows,'allBytesMatchGit':True,'nativeInputs':471},indent=2)+'\n');print('Verified source files',len(rows))
