from pathlib import Path
import subprocess,json,hashlib,zipfile,stat
r=Path.cwd();h=Path(__file__).resolve().parent;run=43430509627;source='ec3a554d433845e9aa8209d9eb20dde48cba6a2a';sha=lambda b:hashlib.sha256(b).hexdigest()
def api(endpoint):
 x=subprocess.run(['gh','api',endpoint],capture_output=True,timeout=300)
 if x.returncode:raise RuntimeError('Read-only artifact acquisition failed')
 return x.stdout
raw=api(f'repos/p2ppsr/interop/actions/runs/{run}/artifacts?per_page=100');(h/'artifacts-api.json').write_bytes(raw);meta=json.loads(raw);row=next(a for a in meta['artifacts']if a['name']=='native-image-filesystem-audit');assert not row['expired']and row['workflow_run']['head_sha']==source
original=api(f"repos/p2ppsr/interop/actions/artifacts/{row['id']}/zip");(h/'original.zip').write_bytes(original);assert len(original)==row['size_in_bytes']and'sha256:'+sha(original)==row['digest']
seed=r/f'out/source19-ci/acquisition/{run}';seed.mkdir(parents=True,exist_ok=True);target=seed/f"artifact-{row['id']}.zip";assert not target.exists();target.write_bytes(original)
root=h/'original';root.mkdir();members=[];expanded=0
with zipfile.ZipFile(h/'original.zip')as z:
 assert {x.filename for x in z.infolist()}=={'audit.json','base-image.json','base-filesystem.json','final-image.json','final-filesystem.json','overlay.json'}
 for m in z.infolist():
  assert not stat.S_ISLNK(m.external_attr>>16);b=z.read(m);expanded+=len(b);assert expanded<=128*1024*1024
  (root/m.filename).write_bytes(b);members.append({'path':m.filename,'bytes':len(b),'sha256':sha(b),'crc32':m.CRC})
(h/'acquisition.json').write_text(json.dumps({'source':source,'run':run,'artifactId':row['id'],'archiveSha256':sha(original),'compressedBytes':len(original),'expandedBytes':expanded,'members':members,'nativeQualification':False},indent=2)+'\n')
print(json.dumps({'artifactId':row['id'],'members':len(members),'compressedBytes':len(original),'seededForTerminalReacquisition':True}))
