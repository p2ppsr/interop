from pathlib import Path
import tempfile,zipfile,subprocess,sys,json,hashlib
base=Path(__file__).resolve().parent;results=[]
for case in ['ordinary','parent-traversal','canonical-alias','symlink']:
 with tempfile.TemporaryDirectory(prefix='native-extraction-control-')as tmp:
  root=Path(tmp);archive=root/'sample.zip'
  with zipfile.ZipFile(archive,'w')as z:
   z.writestr('ordinary/file.json','{"control":true}')
   if case=='parent-traversal':z.writestr('../outside.json','bad')
   if case=='canonical-alias':z.writestr('ordinary/./file.json','bad')
   if case=='symlink':
    info=zipfile.ZipInfo('link');info.create_system=3;info.external_attr=0o120777<<16;z.writestr(info,'/tmp/target')
  p=subprocess.run([sys.executable,str(base/'safe-extract.py'),str(archive),str(root/'extracted')],capture_output=True,text=True)
  assert (p.returncode==0)==(case=='ordinary'),(case,p.stdout,p.stderr)
  results.append({'case':case,'exitCode':p.returncode,'expected':'PASS'if case=='ordinary'else'REJECT','stdout':p.stdout,'stderr':p.stderr})
receipt={'schema':'tpnil-local-extraction-controls@1','claim':'ACQUISITION_TOOLING_CONTROLS_ONLY','extractorSha256':hashlib.sha256((base/'safe-extract.py').read_bytes()).hexdigest(),'controls':results,'nativeCalls':0}
p=base/'extraction-controls.json';assert not p.exists();p.write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'verified':True,'positive':1,'negativeRejected':3}))
