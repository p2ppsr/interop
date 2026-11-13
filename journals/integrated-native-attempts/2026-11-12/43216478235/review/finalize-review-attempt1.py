import pathlib,json,hashlib,zipfile
H=pathlib.Path(__file__).resolve().parent
sha=lambda b:hashlib.sha256(b).hexdigest()
read=lambda p:json.loads(p.read_text())
meta=lambda p:{'path':str(p.relative_to(H)),'bytes':p.stat().st_size,'sha256':sha(p.read_bytes())}
source=read(H/'source-inventory.json');assert source['source']=='1f9fe0f9b979e9bbca66e90335f02ba2b80c7d41'
for row in source['files']:
 p=H/'source'/row['path'];assert p.is_file() and not p.is_symlink() and p.stat().st_size==row['bytes']and sha(p.read_bytes())==row['sha256']
a=read(H/'acquisition/acquisition.json');assert a['source']==source['source']and a['actualJobSeconds']==2285
for row in a['files']:
 p=H/'acquisition'/row['path'];assert p.stat().st_size==row['bytes']and sha(p.read_bytes())==row['sha256']
original=H/'attempt-2026-11-12T12-57-15Z/original';members=a['zipIntegrity'][0]['members'];assert len(members)==376
with zipfile.ZipFile(H/'acquisition/original-native.zip')as z:
 assert z.testzip()is None
 assert set(z.namelist())=={r['path']for r in members}
 for row in members:
  data=z.read(row['path']);assert len(data)==row['bytes']and sha(data)==row['sha256'];assert(original/row['path']).read_bytes()==data
replay=read(H/'replay.json');assert replay['result']=='NOT_VERIFIED'and'qualification.json'in replay['failure']['message']
assert 'Final submission has unresolved unmined ancestry'in(H/'native-parent.stderr.log').read_text();assert(H/'native-parent.stdout.log').stat().st_size==0
text=(H/'partial.stdout.json').read_text();partial=json.loads(text[text.index('{\n  "schema"'):]);assert partial['qualifiedEnvironment']==False
components=read(H/'components-2/review.json');assert components['result']=='TEN_CHILD_REPLAYS_VERIFIED'and len(components['children'])==10
for c in components['children']:
 assert c['exitCode']==0 and c['stdoutBytes']>0 and c['receipt']['verified']==True
 p=H/'components-2'/f'{c["repetition"]}-{c["script"]}.stdout.log';assert p.stat().st_size==c['stdoutBytes']
repetitions=[]
for rep in partial['repetitions']:
 i=rep['index'];record=read(original/f'repetition-{i}/record.json');raw=[a for v in record['vectors']for a in v['assertions']];assert len(raw)==535
 counts={k:sum(a['outcome']==k for a in raw)for k in ['PASS','FAIL','BLOCKED']};assert counts=={'PASS':432,'FAIL':27,'BLOCKED':76}
 integ=read(original/f'repetition-{i}/evidence/integrated/result.json');assert len(integ['assertions'])==77 and all(a['result']=='PASS'for a in integ['assertions'])
 assert all(v['replay']=='VERIFIED_MODULE_ONLY'for v in rep['modules'].values())
 repetitions.append({'index':i,'rawNativeCounts':counts,'nativePredicates':535,'independentlyReplayedPresentModules':7,'historical99':{k:len(v)for k,v in rep['modules']['clauses']['historical99'].items()},'rawIntegrationCounts':{'PASS':77,'FAIL':0,'BLOCKED':0},'originalRust':'NOT_EXECUTED','originalRecordSha256':sha((original/f'repetition-{i}/record.json').read_bytes())})
paths=['prepared.json','source-inventory.json','dependencies.json','replay.mjs','replay.json','replay.stdout.json','replay.stderr.log','native-parent.stdout.log','native-parent.stderr.log','partial.mjs','partial.stdout.json','partial.stderr.log','components-all.mjs','components-2/review.json','diagnose-ancestry.mts','ancestry-diagnosis.json','diagnose-control-ancestry.mts','control-ancestry-diagnosis.json','portability-diagnosis.json','original-members-before.json','original-members-after.json']
paths +=[str(p.relative_to(H))for p in sorted((H/'components-2').glob('*.log'))]
report={'schema':'tpnil-native6-independent-frozen-review@1','source':source['source'],'run':43216478235,'result':'FAILED_ATTEMPT_REPRODUCED_WITH_PARTIAL_CHILD_REPLAYS','qualifiedEnvironment':False,'completeBRC100Conformance':False,'supplementalNativeObservationsAdmitted':0,'wholeRowQualifications':0,'sourceFilesVerified':len(source['files']),'nativeInputs':164,'originalZipSha256':sha((H/'acquisition/original-native.zip').read_bytes()),'originalMembersVerified':len(members),'originalBytesUnchanged':True,'frozenSourceUnchanged':True,'repetitions':repetitions,'parent':{'exitCode':1,'error':'Final submission has unresolved unmined ancestry','completeNativeOrIntegratedQualification':False},'componentChildReplays':10,'rustExecution':'NOT_EXECUTED_IN_ORIGINAL_AND_NOT_FABRICATED','findings':['Three deterministic controlled bridge ancestors per repetition are present in exact positive-control public BEEF but absent from original parent graph assembly. Their independently verified graph completion is a prospective diagnosis only.','Each portability dataset retains18outputs across9aborted reference-only parents. Historical projection demands signed bytes unconditionally; no aborted rows may be discarded.','Raw failures and blocked values remain unchanged. Missing canonicalized extension/certificate reports and unfinished permission extension still block complete qualification.'],'economics':{'actualJobSeconds':2285,'actualCurrencyCharge':None,'newNativeSessionsFromReview':0},'files':[meta(H/p)for p in paths]}
(H/'independent-review.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'result':report['result'],'sha256':sha((H/'independent-review.json').read_bytes()),'sourceFiles':len(source['files']),'members':len(members)}))
