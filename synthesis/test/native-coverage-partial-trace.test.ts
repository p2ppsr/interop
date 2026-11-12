// Constructed mutations of a retained TS reference. These tests admit no native run.
import {test} from 'vitest'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {Transaction} from '@bsv/sdk'
import {partialTracePolicy as model,verifyPartialTracePolicy} from '../src/wallet-lab/native/coverage-completion/partial-trace-model.js'
import {call,MissingInput,evaluatePartialTrace,verifyActionMetadata,verifyWholeActionInventory,verifyCertificateRestartJoin,traceEvidence} from '../src/wallet-lab/native/coverage-completion/partial-trace-verifier.js'
const root=path.resolve(import.meta.dirname,'../..')
const reference=JSON.parse(fs.readFileSync(path.join(root,'fixtures/native-conditional/reference-20261111/report.json'),'utf8'))
const copy=<T,>(x:T):T=>structuredClone(x)
const metadataOutput=(r:any,id:string)=>{const action=call(r,id).result.actions[0],source=call(r,'population-0'),tx=Transaction.fromAtomicBEEF(source.result.tx),i=tx.outputs.findIndex((o:any)=>o.satoshis===source.args.outputs[0].satoshis&&o.lockingScript.toHex()===source.args.outputs[0].lockingScript);return action.outputs.find((o:any)=>o.outputIndex===i)}
test('fixed63 rows retain scope limits and both unavailable complete-branch requirements',()=>{assert.equal(model.rows.length,63);assert.equal(new Set(model.rows.map((r:any)=>r.id)).size,63);assert.ok(model.rows.every((r:any)=>r.originalRemainingWork&&r.scopeLimit));assert.equal(model.rows.find((r:any)=>r.id==='transaction.batch-send/returnTXIDOnly').needsNewNativeCalls,true);assert.equal(model.rows.filter((r:any)=>r.supplement==='whole-action-inventory').length,1)})
test('prospective model binds current five policy revisions without replacing historical source',()=>assert.equal(verifyPartialTracePolicy(),true))
test('empty source remains63BLOCKED and grants no native admission',async()=>{const r=await evaluatePartialTrace(undefined,()=>{throw Error('absent')});assert.deepEqual(r.counts,{SCOPED_PASS:0,FAIL:0,BLOCKED:63});assert.equal(r.wholeRowQualifications,0);assert.equal(r.nativeQualification,false);assert.equal(r.original535ResultsChanged,false)})
test('all six retained include controls support only the precise metadata helper',()=>{for(const id of ['actions-only-includeInputs','actions-only-includeInputSourceLockingScripts','actions-only-includeInputUnlockingScripts','actions-only-includeOutputs','actions-only-includeOutputLockingScripts','actions-includes'])assert.equal(verifyActionMetadata(reference,id).comparedActions,11)})
for(const field of ['basket','tags','outputDescription','customInstructions'])test(`signed requested-output ${field} substitution rejects`,()=>{const r=copy(reference),o=metadataOutput(r,'actions-only-includeOutputs');o[field]=field==='tags'?['unrequested']:'incorrect value';assert.throws(()=>verifyActionMetadata(r,'actions-only-includeOutputs'))})
test('optional instructions are not invented as a mandatory field',()=>{const r=copy(reference);delete metadataOutput(r,'actions-only-includeOutputs').customInstructions;assert.equal(verifyActionMetadata(r,'actions-only-includeOutputs').comparedActions,11)})
test('input sequence substitution rejects',()=>{const r=copy(reference);call(r,'actions-only-includeInputs').result.actions[0].inputs[0].sequenceNumber=0;assert.throws(()=>verifyActionMetadata(r,'actions-only-includeInputs'),/sequence/)})
test('duplicate action cannot replace an independently signed population member',()=>{const r=copy(reference),a=call(r,'actions-only-includeOutputs').result.actions;a[1]=copy(a[0]);assert.throws(()=>verifyActionMetadata(r,'actions-only-includeOutputs'),/Duplicate/)})
for(const kind of ['trailing','truncated','sparse','wrong-txid'])test(`public BEEF ${kind} rejects`,()=>{const r=copy(reference),row=call(r,'population-0'),bytes=row.result.tx;if(kind==='trailing')bytes.push(0);if(kind==='truncated')bytes.pop();if(kind==='sparse'){const index=bytes.findIndex((b:number)=>b===0);assert.ok(index>=0);delete bytes[index]}if(kind==='wrong-txid')row.result.txid='77'.repeat(32);assert.throws(()=>verifyActionMetadata(r,'actions-only-includeOutputs'))})
test('contradictory successful metadata and error rejects',()=>{const r=copy(reference);call(r,'actions-only-includeInputs').error={message:'failure'};assert.throws(()=>verifyActionMetadata(r,'actions-only-includeInputs'),/contradictory/)})
test('whole inventory cannot be inferred from fixture subset or final storage',()=>assert.throws(()=>verifyWholeActionInventory(reference,undefined),MissingInput))
const cert=(serialNumber:string)=>({type:'type',serialNumber,subject:'subject',certifier:'issuer',revocationOutpoint:'outpoint',signature:'signed',fields:{name:'encrypted'}})
const certs=()=>{const c=cert('kept');return{conditional:{trace:[{id:'issuance-valid',result:c}]},states:{trace:[{id:'baseline',result:{certificates:[c]}}]},extension:{trace:['baseline','inventory-before-restart','inventory-after-restart'].map(id=>({id,result:{certificates:[copy(c)]}})),restart:{kind:'NATIVE_BROWSER_RESTART'}}}}
test('local client reopen cannot be relabeled as native restart',()=>{const f=certs();f.extension.restart.kind='REFERENCE_CLIENT_REOPEN';assert.throws(()=>verifyCertificateRestartJoin(f.conditional,f.states,f.extension,'certificate.issuance/valid-issuance'),MissingInput)})
test('equal baseline subset cannot hide a lost certificate acquired before restart',()=>{const f=certs();call(f.extension,'inventory-before-restart').result.certificates.push(cert('new'));assert.throws(()=>verifyCertificateRestartJoin(f.conditional,f.states,f.extension,'certificate.issuance/valid-issuance'),/inventory changed/)})
for(const field of ['signature','subject','fields'])test(`restart changed signed ${field} rejects`,()=>{const f=certs(),row=call(f.extension,'inventory-after-restart').result.certificates[0];row[field]=field==='fields'?{name:'changed'}:'changed';assert.throws(()=>verifyCertificateRestartJoin(f.conditional,f.states,f.extension,'certificate.issuance/valid-issuance'),/inventory changed/)})
test('duplicate signed tuple cannot preserve only a count',()=>{const f=certs();call(f.extension,'inventory-after-restart').result.certificates.push(copy(cert('kept')));assert.throws(()=>verifyCertificateRestartJoin(f.conditional,f.states,f.extension,'certificate.issuance/valid-issuance'),/Duplicate/)})
test('relinquished tuple cannot reappear',()=>{const f=certs();f.conditional.trace=[{id:'certificate-relinquish',args:{type:'type',certifier:'issuer',serialNumber:'kept'}}] as any;assert.throws(()=>verifyCertificateRestartJoin(f.conditional,f.states,f.extension,'certificate.inventory/relinquish-one'),/reappeared/)})
test('scoped call digest records exact actor/request/result without inventing timestamps',()=>{const r=copy(reference),id='actions-includes',before=traceEvidence(r,id);assert.equal(before.traceIndex,r.trace.findIndex((v:any)=>v.id===id));assert.equal(before.method,'listActions');call(r,id).actor='different actor';const changed=traceEvidence(r,id);assert.notEqual(before.callSha256,changed.callSha256);assert.notEqual(before.requestSha256,changed.requestSha256);assert.equal(before.responseSha256,changed.responseSha256)})

import { gunzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { verifyPartialTracePrerequisites, verifyPartialTraceParent } from '../src/wallet-lab/native/coverage-completion/partial-trace-parent.js'
import { runNativePartialTrace } from '../src/wallet-lab/native/coverage-completion/partial-trace-run.js'
const retainedBytes=gunzipSync(fs.readFileSync(new URL('./fixtures/native-partial-trace/conditional-native6.json.gz',import.meta.url)))
const retainedProvenance=JSON.parse(fs.readFileSync(new URL('./fixtures/native-partial-trace/provenance.json',import.meta.url),'utf8'))
assert.equal(createHash('sha256').update(retainedBytes).digest('hex'),retainedProvenance.originalSha256)
const onlyConditional=(bytes=retainedBytes)=>(name:string)=>{if(name==='conformance/conditional.json')return bytes;throw Error(`No retained ${name}`)}
test('current evaluator recomputes45 scoped observations and keeps18 gaps with no native admission',async()=>{const v=await evaluatePartialTrace(undefined,onlyConditional());assert.deepEqual(v.counts,{SCOPED_PASS:45,FAIL:0,BLOCKED:18});assert.equal(v.nativeQualification,false);assert.equal(v.rows.find((r:any)=>r.id==='transaction.batch-send/returnTXIDOnly').result,'BLOCKED');assert.equal(v.rows.find((r:any)=>r.id==='query.action-filters/empty-labels').result,'BLOCKED');assert.equal(v.original535ResultsChanged,false);assert.equal(retainedProvenance.nativeQualification,false)},30000)
test('producer reads fixed files without wallet calls or a native-admission seal',async()=>{const saved=new Map<string,unknown>();const context:any={services:{submissions:[]},application:new Proxy({},{get:()=>{throw Error('Unexpected wallet access')}}),evidence:{readBytes:onlyConditional(),addJson:(n:string,v:unknown)=>saved.set(n,v)}};const result=await runNativePartialTrace(context);assert.equal(result.publicCalls,0);assert.equal(result.newSignedTransactions,0);assert.equal(saved.get('conformance/partial-trace.json'),result);assert.equal(Object.hasOwn(result,'modules'),false);await evaluatePartialTrace(result,onlyConditional())},30000)
for(const kind of ['changed-result','changed-input-digest','changed-scope','changed-policy'] as const)test(`retained result rejects ${kind}`,async()=>{const {modules:_modules,...v}=await evaluatePartialTrace(undefined,onlyConditional());if(kind==='changed-result')v.assertions[0]!.result='FAIL';if(kind==='changed-input-digest')v.inputs.conditional.sha256='0'.repeat(64);if(kind==='changed-scope')v.rows[0].scopeLimit='Complete BRC100 qualification';if(kind==='changed-policy')v.policySha256='0'.repeat(64);await assert.rejects(evaluatePartialTrace(v,onlyConditional()))},30000)
test('version downgrade and duplicate public results cannot become scoped success',async()=>{const r=JSON.parse(retainedBytes.toString());r.oracle='tpnil-native-conditional-oracle@1.0.0';const v=await evaluatePartialTrace(undefined,onlyConditional(Buffer.from(JSON.stringify(r))));assert.equal(v.rows.find((r:any)=>r.id==='query.action-includes/includeOutputs').result,'FAIL');const duplicate=JSON.parse(retainedBytes.toString());duplicate.trace.push(copy(duplicate.trace[0]));const d=await evaluatePartialTrace(undefined,onlyConditional(Buffer.from(JSON.stringify(duplicate))));assert.equal(d.rows.find((r:any)=>r.id==='transaction.defaults/signAndProcess-omitted-true').result,'FAIL')},30000)
function parentPrerequisites(){const roots=['a','b','c'].map(x=>x.repeat(64)+'.0'),funding={verified:true,declaredNativePayments:roots},native={verifiedEvidence:true,transactions:[],invalidNativeResponses:[],allReturnedTransactionsProven:true};const prior:any={conditionalTransactionBindings:copy(native),transactionStateBindings:{...copy(native),finalSubmissionBinding:{verified:true,finalCount:3}},submissionAncestryBindings:{verified:true,finalCount:3,transactionsChecked:3,ancestorsChecked:6},coverageSuiteBindings:{verified:true,prelude:{verified:true,beforeOtherCustomerTransactions:true,initialFundingOutpoints:roots},browser:{verified:true,contexts:5,restarts:4,sameProfile:true},permissions:{verified:true,finalLedgerBound:true},transactions:{verified:true,finalCount:3,funding:copy(funding)},extension:{verified:true,transactionOwnershipAndFundingStillRequired:false,funding:copy(funding)},certificates:{verified:true,finalLedgerChecked:true,funding:copy(funding)}}};return{roots,prior}}
test('constructed prerequisite controls grant no standalone native admission',()=>{const f=parentPrerequisites();assert.deepEqual(verifyPartialTracePrerequisites(f.prior,f.roots,3),{verified:true,fullNativeAdmission:false})})
for(const kind of ['missing','no-base','no-prelude','late-prelude','other-roots','wrong-restart','permission-unjoined','funding-unjoined','conditional-unjoined','invalid-response-upgrade','missing-state-final','wrong-state-final','wrong-ancestry-final','negative-ancestors','missing-certificate-final','wrong-transaction-final','extension-ownership-pending']as const)test(`parent prerequisite rejects ${kind}`,()=>{const f=parentPrerequisites(),p=f.prior,s=p.coverageSuiteBindings;if(kind==='missing')f.prior=undefined;if(kind==='no-base')s.verified=false;if(kind==='no-prelude')s.prelude.verified=false;if(kind==='late-prelude')s.prelude.beforeOtherCustomerTransactions=false;if(kind==='other-roots')s.prelude.initialFundingOutpoints=['d'.repeat(64)+'.0'];if(kind==='wrong-restart')s.browser.restarts=3;if(kind==='permission-unjoined')s.permissions.finalLedgerBound=false;if(kind==='funding-unjoined')s.transactions.funding.declaredNativePayments=[];if(kind==='conditional-unjoined')p.conditionalTransactionBindings.verifiedEvidence=false;if(kind==='invalid-response-upgrade')p.conditionalTransactionBindings.invalidNativeResponses=[{kind:'MALFORMED_RETURN'}];if(kind==='missing-state-final')p.transactionStateBindings.finalSubmissionBinding.verified=false;if(kind==='wrong-state-final')p.transactionStateBindings.finalSubmissionBinding.finalCount=2;if(kind==='wrong-ancestry-final')p.submissionAncestryBindings.finalCount=2;if(kind==='negative-ancestors')p.submissionAncestryBindings.ancestorsChecked=-1;if(kind==='missing-certificate-final')s.certificates.finalLedgerChecked=false;if(kind==='wrong-transaction-final')s.transactions.finalCount=2;if(kind==='extension-ownership-pending')s.extension.transactionOwnershipAndFundingStillRequired=true;assert.throws(()=>verifyPartialTracePrerequisites(f.prior,f.roots,3))})
test('parent counterexample remains explicitly unproven rather than rewritten',()=>{const f=parentPrerequisites();f.prior.conditionalTransactionBindings.invalidNativeResponses=[{kind:'MALFORMED_RETURN'}];f.prior.conditionalTransactionBindings.allReturnedTransactionsProven=false;assert.equal(verifyPartialTracePrerequisites(f.prior,f.roots,3).verified,true)})
test('45 scoped passes cannot bypass absent current module parent bindings',async()=>{const {modules:_modules,...report}=await evaluatePartialTrace(undefined,onlyConditional()),f=parentPrerequisites();await assert.rejects(verifyPartialTraceParent(report,{profile:'ITCVE-1@4.5.0',identity:report.identity,readEvidence:onlyConditional()}as any,f.prior),/Missing fixed source/)},30000)

import { Script } from '@bsv/sdk'
import { nativeCompletionProviders } from '../src/wallet-lab/native/coverage-completion/providers.js'
import { verifyPartialTraceRawBindings } from '../src/wallet-lab/native/coverage-completion/partial-trace-parent.js'
/** Constructed graph controls test raw joins only. They are not a child oracle,
 * signed-wallet fixture, or an independently admitted native environment. */
function rawParentFixture() {
  const mined = new Transaction(1, [], [0, 1, 2].map(() => ({ satoshis: 10001, lockingScript: Script.fromHex('51') })), 0)
  const payments = [0, 1, 2].map(index => new Transaction(1, [{ sourceTransaction: mined, sourceTXID: mined.id('hex'), sourceOutputIndex: index, unlockingScript: Script.fromHex(''), sequence: 0xffffffff }], [{ satoshis: 10000, lockingScript: Script.fromHex('51') }], index))
  const target = new Transaction(1, [{ sourceTransaction: payments[0]!, sourceTXID: payments[0]!.id('hex'), sourceOutputIndex: 0, unlockingScript: Script.fromHex(''), sequence: 0xffffffff }], [{ satoshis: 9000, lockingScript: Script.fromHex('51') }], 0)
  const roots = payments.map(tx => `${tx.id('hex')}.0`), all = [mined, ...payments, target]
  const global = [{ txid: target.id('hex'), beefHex: target.toHex(), verdict: 'ACCEPTED_BY_NETWORK' }]
  const identity = 'constructed-wallet', date = '2026-11-12T00:00:00.000Z'
  const restart = { identity, endedAt: date, sequence: 4 }
  const files: Record<string, any> = {
    'native-submissions.json': copy(global),
    'service-components.json': { storage: 'constructed-source' },
    'conformance/service-counterparts.json': { 'replacement-wallet.itcve.test': { storage: 'constructed-replacement' } },
    'native-transactions.json': all.map(tx => ({ txid: tx.id('hex'), rawTxHex: tx.toHex() })),
    'funding.json': { fundingTxid: payments[0]!.id('hex') },
    'conformance/funding-reserves.json': { payments: roots.slice(1).map(outpoint => ({ outpoint })) },
    'native-browser-contexts.json': { contexts: [{}, {}, {}, {}, { restart: copy(restart) }] }
  }
  const read = (name: string) => { assert.ok(Object.hasOwn(files, name), name); return Buffer.from(JSON.stringify(files[name])) }
  files['native-output-provider-registry.json'] = nativeCompletionProviders(read)
  const binding: any = { profile: 'ITCVE-1@4.5.0', identity, fixture: { txid: mined.id('hex'), rawHex: mined.toHex() },
    storageTransactions: new Map(all.map(tx => [tx.id('hex'), tx])), resolvedTransactions: new Map(all.map(tx => [tx.id('hex'), tx])),
    declaredNativePayments: roots, globalSubmissions: copy(global), finalSubmissions: copy(global), readEvidence: read }
  const modules: any = { conditional: { identity, submissions: global.map((row, index) => ({ index, txid: row.txid, serializedHex: row.beefHex, verdict: row.verdict })) } }
  for (const name of ['states', 'transactions', 'certificateStates', 'certificates']) modules[name] = { identity, submissionStart: 1, submissionEnd: 1, submissions: [], ...(name === 'states' ? {} : { submissionPrefix: copy(global) }) }
  modules.certificates.restart = { kind: 'NATIVE_BROWSER_RESTART', receipt: copy(restart) }
  const checked = { modules, inputs: Object.fromEntries(Object.keys(modules).map(name => [name, {}])), assertions: [] }
  const report = { identity, startedAt: date, endedAt: date, submissionStart: 1, submissionEnd: 1 }
  const prior = parentPrerequisites().prior
  prior.coverageSuiteBindings.prelude.initialFundingOutpoints = roots
  for (const name of ['transactions', 'extension', 'certificates']) prior.coverageSuiteBindings[name].funding.declaredNativePayments = roots
  prior.coverageSuiteBindings.transactions.finalCount = 1
  prior.transactionStateBindings.finalSubmissionBinding.finalCount = 1
  prior.submissionAncestryBindings.finalCount = 1
  return { checked, report, binding, prior, files, roots, all, mined, target }
}
test('raw parent joins actual serialized graph and both source-owned roles without native admission', () => {
  const f = rawParentFixture(), result = verifyPartialTraceRawBindings(f.report, f.checked, f.binding, f.prior)
  assert.equal(result.verified, true); assert.equal(result.fullNativeAdmission, false); assert.equal(result.graphVisits, 3); assert.equal(result.providers, 2)
})
for (const kind of ['foreign-identity', 'missing-module', 'changed-global', 'truncated-final', 'provider-omitted', 'provider-renamed', 'extra-provider', 'storage-omitted', 'duplicate-storage', 'storage-body', 'graph-omitted', 'missing-funding', 'duplicate-funding', 'wrong-start', 'fractional-window', 'negative-window', 'module-window', 'changed-prefix', 'conditional-prefix', 'restart-foreign', 'restart-late', 'late-unresolved'] as const) test(`raw parent rejects ${kind}`, () => {
  const f = rawParentFixture(), { binding: b, files, checked: c, report: r } = f
  if (kind === 'foreign-identity') c.modules.states.identity = 'foreign'
  if (kind === 'missing-module') (c.inputs.states as any).missing = true
  if (kind === 'changed-global') files['native-submissions.json'][0].verdict = 'REJECTED'
  if (kind === 'truncated-final') b.finalSubmissions = []
  if (kind === 'provider-omitted') files['native-output-provider-registry.json'].pop()
  if (kind === 'provider-renamed') files['native-output-provider-registry.json'][0].id = 'renamed'
  if (kind === 'extra-provider') files['conformance/service-counterparts.json']['unapproved.itcve.test'] = {}
  if (kind === 'storage-omitted') files['native-transactions.json'].pop()
  if (kind === 'duplicate-storage') files['native-transactions.json'].push(copy(files['native-transactions.json'][0]))
  if (kind === 'storage-body') files['native-transactions.json'][0].rawTxHex = f.target.toHex()
  if (kind === 'graph-omitted') b.resolvedTransactions.delete(f.mined.id('hex'))
  if (kind === 'missing-funding') b.declaredNativePayments = []
  if (kind === 'duplicate-funding') files['conformance/funding-reserves.json'].payments[1].outpoint = f.roots[0]
  if (kind === 'wrong-start') r.startedAt = '2026-11-13T00:00:00.000Z'
  if (kind === 'fractional-window') r.submissionStart = 0.5
  if (kind === 'negative-window') r.submissionEnd = -1
  if (kind === 'module-window') c.modules.states.submissionEnd = 2
  if (kind === 'changed-prefix') c.modules.transactions.submissionPrefix = []
  if (kind === 'conditional-prefix') c.modules.conditional.submissions[0].index = 1
  if (kind === 'restart-foreign') c.modules.certificates.restart.receipt.identity = 'foreign'
  if (kind === 'restart-late') { c.modules.certificates.restart.receipt.endedAt = '2026-11-13T00:00:00.000Z'; files['native-browser-contexts.json'].contexts[4].restart = copy(c.modules.certificates.restart.receipt) }
  if (kind === 'late-unresolved') {
    const tx = new Transaction(1, [{ sourceTXID: '77'.repeat(32), sourceOutputIndex: 0, unlockingScript: Script.fromHex(''), sequence: 0xffffffff }], [{ satoshis: 1, lockingScript: Script.fromHex('51') }], 0)
    b.finalSubmissions.push({ txid: tx.id('hex'), beefHex: tx.toHex(), verdict: 'REJECTED' })
    f.prior.coverageSuiteBindings.transactions.finalCount = 2; f.prior.transactionStateBindings.finalSubmissionBinding.finalCount = 2; f.prior.submissionAncestryBindings.finalCount = 2
  }
  assert.throws(() => verifyPartialTraceRawBindings(r, c, b, f.prior))
})
