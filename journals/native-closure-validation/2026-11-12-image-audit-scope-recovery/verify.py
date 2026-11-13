from pathlib import Path
import json,gzip,hashlib,zipfile,sys
r=Path(__file__).resolve().parent;m=json.loads((r/'validation.json').read_bytes());h=lambda b:hashlib.sha256(b).hexdigest()
assert {p.relative_to(r).as_posix()for p in r.rglob('*')if p.is_file()}==set(m['files'])|{'validation.json'}
for n,d in m['files'].items():assert h((r/n).read_bytes())==d,n
read=lambda n:json.loads(gzip.decompress((r/(n+'.gz')).read_bytes()))
expected=read('linux-fixed-expected.json');zpath=r.parents[2]/'journals/integrated-native-attempts/2026-11-12/43285086155/artifact-13976075912.zip'
with zipfile.ZipFile(zpath)as z:actual=json.loads(z.read('final-filesystem.json'))
assert expected==actual and len(actual)==71431
bad=dict(expected);bad['/opt']={'type':'directory','mode':493,'uid':0,'gid':0};assert bad!=actual
bad=dict(actual);del bad['/work/scripts/verify-native-image.mjs'];assert bad!=expected
manifest=gzip.decompress((r/'linux-storage-manifest.json.gz').read_bytes());assert h(manifest)==actual['/opt/tpnil/itcve-go-storage-caller-known-inputs.json']['sha256'];assert json.loads(manifest)['binarySha256']==actual['/opt/tpnil/itcve-go-storage-caller-known-inputs']['sha256']
assert m['nativeQualification']is False and len(m['inputs'])==396
if '--current-source'in sys.argv:
 for n,v in m['inputs'].items():assert h(Path(n).read_bytes())==v,n
print(json.dumps({'verified':True,'retainedLinuxEntries':71431,'negativeControls':2,'nativeQualification':False}))
