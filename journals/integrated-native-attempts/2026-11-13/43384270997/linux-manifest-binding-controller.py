from pathlib import Path
import json,re,hashlib
b=Path(__file__).resolve().parent;r=Path.cwd();audit=r/'out/source15-image-audit/original';actual=json.loads((audit/'final-filesystem.json').read_text());binary=actual['/opt/tpnil/itcve-go-storage-caller-known-inputs'];meta=actual['/opt/tpnil/itcve-go-storage-caller-known-inputs.json'];log=(r/'out/source15-ci/acquisition/43384270997/job-131748968631.log').read_text();plain='\n'.join(re.sub(r'^\d{4}-\d\d-\d\dT\S+Z ?','',line)for line in log.splitlines());decoder=json.JSONDecoder();found=[]
for m in re.finditer(r'(?m)^\{',plain):
 try:d,n=decoder.raw_decode(plain[m.start():])
 except json.JSONDecodeError:continue
 if not isinstance(d,dict)or d.get('binarySha256')!=binary['sha256']:continue
 raw=(json.dumps(d,indent=2,ensure_ascii=False)+'\n').encode()
 if hashlib.sha256(raw).hexdigest()==meta['sha256']:found.append((d,raw))
assert found;manifest,raw=found[-1];assert manifest['schema']=='tpnil-storage-caller-known-inputs-go-build@1.0.0';(b/'linux-storage-manifest.json').write_bytes(raw)
(b/'manifest-binding.json').write_text(json.dumps({'source':'71d8b58cbbf802377b34cfbcceb056413b2327d1','run':43384270997,'LinuxManifestSha256':hashlib.sha256(raw).hexdigest(),'LinuxBinarySha256':binary['sha256'],'CIJobLogSha256':hashlib.sha256(log.encode()).hexdigest(),'nativeQualification':False},indent=2)+'\n');print('Independent original Linux manifest bound')
