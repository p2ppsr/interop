from pathlib import Path
import json,re,hashlib
b=Path(__file__).resolve().parent;r=Path.cwd();audit=r/'out/source12-image-audit/original';actual=json.loads((audit/'final-filesystem.json').read_text());binary=actual['/opt/tpnil/itcve-go-storage-caller-known-inputs'];meta=actual['/opt/tpnil/itcve-go-storage-caller-known-inputs.json'];log=(r/'out/source12-ci/acquisition/43358474345/job-131666076231.log').read_text();plain='\n'.join(re.sub(r'^\d{4}-\d\d-\d\dT\S+Z ?','',line)for line in log.splitlines());decoder=json.JSONDecoder();found=[]
for m in re.finditer(r'(?m)^\{',plain):
 try:d,n=decoder.raw_decode(plain[m.start():])
 except json.JSONDecodeError:continue
 if not isinstance(d,dict)or d.get('binarySha256')!=binary['sha256']:continue
 raw=(json.dumps(d,indent=2,ensure_ascii=False)+'\n').encode()
 if hashlib.sha256(raw).hexdigest()==meta['sha256']:found.append((d,raw))
assert found;manifest,raw=found[-1];assert manifest['schema']=='tpnil-storage-caller-known-inputs-go-build@1.0.0';(b/'linux-storage-manifest.json').write_bytes(raw)
(b/'manifest-binding.json').write_text(json.dumps({'source':'4c872d109e49d2e63b3942cc0ec2f7386832c5a9','run':43358474345,'LinuxManifestSha256':hashlib.sha256(raw).hexdigest(),'LinuxBinarySha256':binary['sha256'],'CIJobLogSha256':hashlib.sha256(log.encode()).hexdigest(),'nativeQualification':False},indent=2)+'\n');print('Independent original Linux manifest bound')
