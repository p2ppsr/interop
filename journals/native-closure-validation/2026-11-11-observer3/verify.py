from pathlib import Path,PurePosixPath
import json,hashlib,gzip,re,copy
base=Path(__file__).resolve().parent
sha=lambda b:hashlib.sha256(b).hexdigest()
def verify(manifest):
 assert manifest['claim']=='LOCAL_ENGINEERING_PREFLIGHT_ONLY' and manifest['nativeSessions']==0 and manifest['completeBRC100Conformance'] is False
 rows={x['path']:x for x in manifest['files']};assert len(rows)==len(manifest['files'])
 actual={str(p.relative_to(base)) for p in base.rglob('*') if p.is_file()};assert actual==set(rows)|{'validation.json'}
 decoded={}
 for name,row in rows.items():
  value=PurePosixPath(name);assert not value.is_absolute() and '..' not in value.parts and '\\' not in name
  p=base/name;assert not p.is_symlink();data=p.read_bytes();assert len(data)==row['bytes'] and sha(data)==row['sha256']
  if row.get('encoding')=='gzip':
   raw=gzip.decompress(data);assert len(raw)==row['rawBytes'] and sha(raw)==row['rawSha256'];decoded[name[:-3]]=raw
 for name,digest in manifest['sourceInputs'].items():assert sha(decoded['source/'+name])==digest
 plan=json.loads(decoded['source/'+manifest['nativePlan']['path']]);assert sha(decoded['source/'+manifest['nativePlan']['path']])==manifest['nativePlan']['sha256'];assert len(plan['conformanceInputs'])==105
 for name,digest in plan['conformanceInputs'].items():assert manifest['sourceInputs'][name]==digest
 assert plan['itcve']=='ITCVE-1@4.2.0' and plan['program']=='ISI-4@5.2.0' and plan['claim']=='ENGINEERING_OBSERVATION_ONLY'
 core=decoded['logs/observer3-final-core.log'].decode();assert re.search(r'pass 164\b',core) and re.search(r'fail 0\b',core)
 synth=decoded['logs/observer3-final-synthesis.log'].decode();assert '718 passed | 8 skipped' in synth and '53 passed (53)' in synth
 py=decoded['logs/observer3-final-python.log'].decode();assert 'Ran 5 tests' in py and py.rstrip().endswith('OK')
 published=json.loads(decoded['logs/observer3-final-publication.log']);assert published['verifiedPublishedIntegrationArchives']==14 and published['verifiedPublishedIntegrationAttempts']==16 and published['semantic'] is True and len(published['bundles'])==30
 assert manifest['results']['corePassed']==164 and manifest['results']['synthesisPassed']==718 and manifest['results']['synthesisSkipped']==8
 for item in manifest['predecessorIntegrity']['files']:assert sha(decoded['predecessors/'+item['path']])==item['sha256']
 binding=json.loads(decoded['reviews/candidate-intake/freeze-independent-review.json']);assert binding['result']=='PASS' and binding['plan']['sha256']==manifest['nativePlan']['sha256']
 assert manifest['cost']['actualMoneyUSD'] is None and manifest['cost']['unknownCostsAreZero'] is False
 return True
manifest=json.loads((base/'validation.json').read_text());assert verify(manifest)
mutations=[('native promotion',lambda m:m.update(nativeSessions=1)),('claim promotion',lambda m:m.update(claim='NATIVE_QUALIFICATION')),('wrong test count',lambda m:m['results'].update(corePassed=165)),('source substitution',lambda m:m['sourceInputs'].update({next(iter(m['sourceInputs'])):'0'*64}))]
for label,mutate in mutations:
 candidate=copy.deepcopy(manifest);mutate(candidate)
 try:verify(candidate)
 except AssertionError:continue
 raise AssertionError('Mutation accepted: '+label)
print(json.dumps({'verified':True,'manifestSha256':sha((base/'validation.json').read_bytes()),'files':len(manifest['files']),'sourceInputs':len(manifest['sourceInputs']),'nativePlanInputs':105,'results':manifest['results'],'nativeSessions':0,'negativeChecks':[x[0] for x in mutations]},indent=2))
