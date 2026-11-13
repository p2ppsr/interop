from pathlib import Path
import json,hashlib,shutil,datetime
P=Path(__file__).resolve().parent;R=P.parents[2];B=R/'journals/native-closure-validation/2026-11-12-coverage-completion';sha=lambda b:hashlib.sha256(b).hexdigest()
assert not(B/'validation.json').exists(),'Already sealed'
m=json.loads((B/'draft-manifest.json').read_text());assert m['state']=='DRAFT_UNSEALED_NOT_ADMITTED'
# Explicit historical exceptions approved by parent: five read-only hashes and
# one prospective mechanics source reference, never original native6 source.
history=[]
for x in m['unresolvedHistoricalBytes']:
 assert (x['receipt'].endswith('completion-observer-independent-review/review.json')and x['jsonPointer'].startswith('/source/'))or(x['receipt']=='out/native-review-43216478235/successor-mechanics-review.json'and x['member']['path']=='synthesis/src/wallet-lab/native/verify.ts')
 history.append({**x,'replayable':False,'rawReceiptRetained':True,'classification':'INTERMEDIATE_LOCAL_SHARED_SOURCE_HASH_ONLY; FINAL_SOURCE_AND_FAILED_RAW_CAPTURES_RETAINED'})
assert len(history)==6
m['historicalHashOnlyReferences']=history;m['unresolvedHistoricalBytes']=[]
m['state']='SEALED_LOCAL_ENGINEERING_VALIDATION';m['sealedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();m.pop('pending',None)
m['sourceCommit']='TO_BE_RECORDED_BY_SUBSEQUENT_OPS_ORDER_AFTER_THIS_ARCHIVE_IS_COMMITTED'
m['scope']='Prospective4.5/698 local engineering validation. Original native6 remains unqualified; no new native or CI run is asserted. Final391-input native closure unchanged across gates. Initial core failure and two pre-final synthesis runs retained separately.'
m['freezeMember']='supplemental/out/native-closure-20261111/coverage3-scaffolding/freeze2.json'
folder='supplemental/out/native-closure-20261111/coverage3-full-gates/'
m['gateMembers']={k:folder+v for k,v in {'before':'before.json','afterInitial':'after-initial.json','beforeCoreRecovery':'before-core-correction.json','afterCoreRecovery':'after-core-correction.json','results':'results.json','coreRecovery':'core-recovery.json','coreCorrected':'core-corrected.log','initialCore':'core.log','python':'python.log','synthesis':'synthesis.log','semantic':'integrations-semantic.log'}.items()}
logical={x['logicalPath']for x in m['members']};assert m['freezeMember']in logical and set(m['gateMembers'].values())<=logical
m['validation']={'finalCorePassed':204,'initialCorePassed':187,'initialCoreFailed':14,'synthesisPassed':1705,'synthesisSkipped':90,'pythonPassed':5,'check':'PASS','standards':'PASS','typecheck':'PASS','publishedAcceptedArchives':14,'retainedFailedAttempts':19,'nativeSourceInputs':391,'completeGateInputs':3033,'additionalNativeSessions':0,'full698CapacityQualified':False,'knownCohortJobSeconds':25120,'actualMoneyUsd':None,'focusedCountsOverlapFullSuites':True}
readme='''# Coverage completion: local validation\n\nThis archive retains the prospective ITCVE-1@4.5.0 / ISI-4@5.5.0 engineering validation, including original failed controls and the exact corrected source. It is **not a native qualification**. The original native6 artifact remains unchanged and unqualified.\n\nThe frozen391-input native closure is unchanged across the completed local gates. Final core tests:204passed; synthesis:1705passed and90explicitly skipped; Python:5passed. The initial core187pass/14fail sample and prior pre-final synthesis runs remain retained. Historical publication replay verifies14acceptedarchives and preserves19failedattempts. Focused test counts overlap these suites and must not be added.\n\nSix intermediate local shared-source hashes were recorded without recoverable source copies. Those exact reviews remain preserved and explicitly nonreplayable; they are not substituted with later bytes. All current frozen source, source-bound failed counterexamples, and failed raw observations are retained.\n\nEach original logical path maps to a gzip object addressed by its decoded SHA256. Identical content is stored once. Existing native ZIP and candidate intake evidence are linked by exact hash, not duplicated. Historical local binaries are metadata references, not claimed portable archived executables.\n\nRun `python3 verify.py`; add `--current-source` to compare all3033 final input files and `--staged` after staging. The completion inventory is pinned inside the verifier and prevents manifest-only omissions or scope changes.\n\nKnown closed-cohort use is25120GitHub job-seconds. Local operator, development-agent, capacity, storage and monetary costs remain unknown. The unchanged128MiB/2048-entry action observer bounds are not yet qualified for the full698native program.\n'''
(B/'README.md').write_text(readme)
for src,name in [(P/'prepare.py','prepare.py'),(P/'seal.py','seal.py')]:shutil.copyfile(src,B/name)
support=[{'path':n,'bytes':(B/n).stat().st_size,'sha256':sha((B/n).read_bytes())}for n in ['README.md','prepare.py','seal.py']]
completion={'schema':'tpnil-validation-archive-completion@1','manifestProjection':m,'supportFiles':support,'approvedHistoricalHashOnlyReferences':history}
cb=(json.dumps(completion,indent=2)+'\n').encode();(B/'completion.json').write_bytes(cb)
v=(P/'verify-final-template.py').read_text().replace('__COMPLETION_SHA__',sha(cb));(B/'verify.py').write_text(v)
# Preserve preparation manifest outside the seal, then retire only this owned
# unsealed control file. All original content-addressed objects remain exact.
raw=(B/'draft-manifest.json').read_bytes();(P/'final-draft-manifest.json').write_bytes(raw);(B/'draft-manifest.json').unlink()
m['completionReceipt']={'path':'completion.json','bytes':len(cb),'sha256':sha(cb)}
m['physicalFiles']=[{'path':str(p.relative_to(B)),'bytes':p.stat().st_size,'sha256':sha(p.read_bytes())}for p in sorted(B.rglob('*'))if p.is_file()]
(B/'validation.json').write_text(json.dumps(m,indent=2)+'\n')
print(json.dumps({'manifest':str((B/'validation.json').relative_to(R)),'sha256':sha((B/'validation.json').read_bytes()),'completionSha256':sha(cb),'physicalFiles':len(m['physicalFiles']),'statistics':m['statistics']},indent=2))
