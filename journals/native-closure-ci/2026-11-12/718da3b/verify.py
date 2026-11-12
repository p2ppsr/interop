from pathlib import Path
import hashlib,json
r=Path(__file__).resolve().parent;m=json.loads((r/'manifest.json').read_bytes())
assert {p.name for p in r.iterdir()if p.is_file()}==set(m['files'])|{'manifest.json'}
for n,h in m['files'].items():assert hashlib.sha256((r/n).read_bytes()).hexdigest()==h
assert 'Missing COPY source: out/itcve-go-storage-caller-known-inputs'in(r/'offline.log').read_text()
print(json.dumps({'verified':True,'jobSeconds':m['jobSeconds'],'nativeQualification':False}))
