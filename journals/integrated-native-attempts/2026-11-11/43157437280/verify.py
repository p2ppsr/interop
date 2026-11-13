from pathlib import Path, PurePosixPath
import datetime,gzip,hashlib,json,zipfile
root=Path(__file__).resolve().parent
sha=lambda b:hashlib.sha256(b).hexdigest()
read=lambda p:json.loads((root/p).read_text())
def safe(name):
 p=PurePosixPath(name);assert not p.is_absolute()and '..'not in p.parts and '\\'not in name and p.parts;return root.joinpath(*p.parts)
manifest=read('attempt.json');assert manifest['schema']=='tpnil-integration-attempt@1';assert manifest['claim']=='OBSERVER_EXECUTION_ERROR';assert manifest['walletExecuted']and not manifest['qualifiedEnvironment'];assert not manifest['completeBRC100Conformance']
names=[x['name']for x in manifest['files']];assert len(names)==len(set(names));actual=sorted(str(p.relative_to(root))for p in root.rglob('*')if p.is_file()and p.name!='attempt.json');assert sorted(names)==actual
for entry in manifest['files']:
 p=safe(entry['name']);assert not p.is_symlink();b=p.read_bytes();assert len(b)==entry['size']and sha(b)==entry['sha256'],entry['name']
for entry in read('encoding.json')['receipts']:
 b=safe(entry['path']).read_bytes();assert len(b)==entry['bytes']and sha(b)==entry['sha256'];raw=gzip.decompress(b)if entry['encoding']=='gzip'else b;assert len(raw)==entry['originalBytes']and sha(raw)==entry['originalSha256']
run=read('run.json');jobs=read('jobs.json');artifacts=read('artifacts.json');assert run['id']==43157437280 and run['head_sha']==manifest['source']=='585211c193d0288effeb466bda38fe6ef23ac94d';assert run['status']=='completed'and run['conclusion']=='failure'
selected=[x for x in artifacts['artifacts']if x['id']==13916473615];assert len(selected)==1 and selected[0]['name']=='native-go-yours-wallet-pr368-7e39006'
zipbytes=(root/'native-integrated.zip').read_bytes();assert len(zipbytes)==171987;assert sha(zipbytes)=='dd38ec932fce7db5a8172382046fcc7e34c51542025ab864dcfa430181cab02e';assert selected[0]['digest']=='sha256:'+sha(zipbytes)
with zipfile.ZipFile(root/'native-integrated.zip')as z:
 assert z.testzip()is None;members=[p for p in z.namelist()if not p.endswith('/')];assert len(members)==len(set(members))==40
 assert sorted(members)==sorted(str(p.relative_to(root/'original'))for p in(root/'original').rglob('*')if p.is_file())
 for name in members:assert z.read(name)==safe('original/'+name).read_bytes()
active=[j for j in jobs['jobs']if j['conclusion']!='skipped'];assert len(active)==1;dt=lambda s:datetime.datetime.fromisoformat(s.replace('Z','+00:00'));seconds=sum((dt(j['completed_at'])-dt(j['started_at'])).total_seconds()for j in active);assert seconds==828
failed=[s['name']for s in active[0]['steps']if s['conclusion']=='failure'];assert failed==['Execute and independently verify the integrated native wallet graph']
log=gzip.decompress((root/'job-130980528231.log.gz').read_bytes()).decode();assert 'Native repetition 1 failed (1)'in log and '13916473615'in log and sha(zipbytes)in log
lock=read('original/run-lock.json');assert lock['source']==manifest['source'];assert lock['plan']['claim']=='ENGINEERING_OBSERVATION_ONLY'and not lock['plan']['walletCandidate']['officialRelease'];assert lock['plan']['wallet']['version']=='5.1.1-pr368.7e39006';assert lock['plan']['itcve']=='ITCVE-1@4.1.0';assert lock['planSha256']=='323b797d8d068e214c982452e9923f42ca6f51e60dc620742b848d45d7d04fbd'
failure=read('original/repetition-1/evidence/attempt-failure.json');assert 'WERR_INVALID_PARAMETER: The height parameter must be at least 1 length.'in failure['message'];assert sum(len(v['assertions'])for v in failure['vectors'])==14
review=read('diagnosis.json');assert review['failure']['originalMessage']==failure['message'];assert review['failure']['request']=={'method':'getHeaderForHeight','args':{'height':0}};assert review['nativeQualification']is False and review['fullConformanceOutcome']is None;assert review['observedExecution']['conformanceModulesStarted']==0
assert not(root/'original/repetition-2').exists()
for name in ['record.json','worker.json']:assert not(root/'original/repetition-1'/name).exists()
for name in ['qualification.json','integrated-qualification.json','rust-repetition-1/result.json','rust-repetition-2/result.json']:assert not(root/'original'/name).exists()
for name in ['clauses','conditional','permission-coverage','transaction-states','certificate-states']:assert not(root/f'original/repetition-1/evidence/conformance/{name}.json').exists()
status=read('original99-status.json');assert status['observed']==0 and status['notObserved']==99 and status['delta']is None;assert len(status['rows'])==len({r['id']for r in status['rows']})==99;assert all(r['candidateOutcome']is None and r['observation']=='NOT_OBSERVED'for r in status['rows'])
shutdown=read('original/repetition-1/shutdown-submissions.json');globalrows=read('original/repetition-1/evidence/native-submissions.json');assert shutdown['initialCount']==len(shutdown['submissions'])==8;assert shutdown['initialProviders']==shutdown['providers'];assert len(globalrows)==4 and globalrows==shutdown['submissions'][:4];assert len(shutdown['errors'])==4;assert all(shutdown['cleanup'][part]['closed']for part in ['browser','services','profile'])
assert read('original/host-repetition-1-cleanup.json')['removed'];assert read('original/host-userns.json')['restoredSuccessfully'];assert read('original/repetition-1/mongo-cleanup.json')['clean']
prospective=root/'prospective/header-correction';p=json.loads((prospective/'header-reference-preflight.json').read_text());assert p['verified']and p['nativeExecutions']==0 and p['claim']=='TYPESCRIPT_REFERENCE_ONLY_NOT_NATIVE_QUALIFICATION';assert p['selected']['height']==1;assert p['observation']['header']=={'header':p['selected']['header']};assert p['cleanup']=={'walletClosed':True,'servicesClosed':True,'directoryRemoved':True}
correction=json.loads((prospective/'controlled-header-review.json').read_text());assert correction['newNativeExecutions']==0;assert correction['tests']['totalPassed']==19
for name,digest in correction['inputs'].items():assert sha((prospective/'source'/name).read_bytes())==digest,name
for name,digest in p['inputs'].items():assert sha((prospective/'source'/name).read_bytes())==digest,name
cost=read('cost.json');assert cost['knownJobWallSeconds']==cost['failedWorkflowJobSecondsIncluded']==828;assert cost['acceptedNativeCustomerPacks']==0;assert cost['actualCIChargeUSD']is None and cost['operatorEffortUSD']is None and cost['developmentAgentUsageUSD']is None and cost['allocatedOwnedCapacityUSD']is None and cost['totalFullCostUSD']is None;assert cost['unknownCostsAreZero']is False
print(json.dumps({'verified':True,'claim':'UNQUALIFIED_ATTEMPT_ARCHIVE_INTEGRITY_AND_DIAGNOSIS','workflowRun':43157437280,'source':manifest['source'],'archiveFiles':len(names),'originalMembers':40,'nativeQualification':False,'original99Observed':0,'original99NotObserved':99,'jobSeconds':828,'prospectiveReferenceOnly':True,'fullCostKnown':False},indent=2))
