from pathlib import Path
import subprocess,json,hashlib
root=Path.cwd();source='c648022b2d9209b7350527bd5553d73e3e82a52c';home=root/'out/native-review-43195585984';frozen=home/'source';snapshot=json.loads((home/'snapshot.json').read_text())
paths=['package.json','.nvmrc','.github','scripts','synthesis','infra','fixtures','components','integrations','itcves','programs','config','src','bin','adapters','schemas','suts']
rows=[]
for raw in subprocess.check_output(['git','ls-tree','-r','-z',source,'--',*paths]).split(b'\0'):
 if not raw:continue
 meta,name=raw.decode().split('\t');mode,kind,blob=meta.split();p=frozen/name;data=p.read_bytes();assert not p.is_symlink() and kind=='blob';assert hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()==blob,name
 rows.append({'path':name,'bytes':len(data),'gitBlob':blob,'sha256':hashlib.sha256(data).hexdigest()})
assert len(rows)==snapshot['files']
out={'source':source,'canonicalRoot':str(frozen.resolve()),'files':rows,'allBytesMatchGit':True,'scriptSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
p=home/'source-inventory.json';p.write_text(json.dumps(out,indent=2)+'\n');print(json.dumps({'files':len(rows),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}))
