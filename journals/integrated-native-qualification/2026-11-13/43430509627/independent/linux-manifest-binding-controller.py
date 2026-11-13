from pathlib import Path
import json,re,hashlib
b=Path(__file__).resolve().parent;r=Path.cwd();audit=r/'out/source19-image-audit/original';actual=json.loads((audit/'final-filesystem.json').read_text());binary=actual['/opt/tpnil/itcve-go-storage-sync-order'];meta=actual['/opt/tpnil/itcve-go-storage-sync-order.json'];log=(r/'out/source19-ci/acquisition/43430509627/job-131902534027.log').read_text();plain='\n'.join(re.sub(r'^\d{4}-\d\d-\d\dT\S+Z ?','',line)for line in log.splitlines());decoder=json.JSONDecoder();found=[]
for m in re.finditer(r'(?m)^\{',plain):
 try:d,n=decoder.raw_decode(plain[m.start():])
 except json.JSONDecodeError:continue
 if not isinstance(d,dict)or d.get('binarySha256')!=binary['sha256']:continue
 raw=(json.dumps(d,indent=2,ensure_ascii=False)+'\n').encode()
 if hashlib.sha256(raw).hexdigest()==meta['sha256']:found.append((d,raw))
assert found;manifest,raw=found[-1];assert manifest['schema']=='tpnil-storage-sync-order-go-build@1.0.0';(b/'linux-storage-manifest.json').write_bytes(raw)
(b/'manifest-binding.json').write_text(json.dumps({'source':'ec3a554d433845e9aa8209d9eb20dde48cba6a2a','run':43430509627,'LinuxManifestSha256':hashlib.sha256(raw).hexdigest(),'LinuxBinarySha256':binary['sha256'],'CIJobLogSha256':hashlib.sha256(log.encode()).hexdigest(),'nativeQualification':False},indent=2)+'\n');print('Independent original Linux manifest bound')
