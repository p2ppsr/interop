// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { Beef, MasterCertificate, PrivateKey, ProtoWallet, PushDrop, Signature, Transaction, Utils, VerifiableCertificate } from '@bsv/sdk'
import { schema, bounds, methods, variants, fixtureConfig, issuerKey, anyone, trust, queryProgram, type Report } from './pagination-model.js'
const funding = JSON.parse(fs.readFileSync(new URL('../../../../../fixtures/teranode/wab-funding-v1.json', import.meta.url), 'utf8'))
const tracker = { currentHeight: async () => 900100, isValidRootForHeight: async (root: string, height: number) => root === funding.merkleRoot && height === funding.fundingHeight }
const canonical = (x: any): string => JSON.stringify(x, (_k, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v)
const fields = ['type', 'serialNumber', 'subject', 'certifier', 'revocationOutpoint', 'fields', 'signature']
const projection = (c: any) => Object.fromEntries(fields.map(k => [k, c?.[k]]))
const tuple = (c: any) => canonical([c.type, c.serialNumber, c.subject, c.certifier])
export function strictAtomic(bytes: any, id: string): Transaction {
  assert.ok(Array.isArray(bytes) && bytes.length > 0)
  for (let i = 0; i < bytes.length; i++) assert.ok(Object.hasOwn(bytes, i) && Number.isInteger(bytes[i]) && bytes[i] >= 0 && bytes[i] <= 255)
  const reader = new Utils.Reader(bytes), beef = Beef.fromReader(reader); assert.equal(reader.eof(), true); assert.equal(beef.atomicTxid, id)
  const tx = Transaction.fromAtomicBEEF(bytes); assert.equal(tx.id('hex'), id); return tx
}
const row = (r: Report, id: string) => { const x = r.trace.find(c => c.id === id); assert.ok(x, `Missing call ${id}`); return x }
const returned = (r: Report, id: string) => { const x = row(r, id); assert.equal(x.error, undefined, `Call failed ${id}`); assert.ok(x.result, `No result ${id}`); return x.result }
const callArgs = (r: Report, id: string, method: string, args: any) => { const c = row(r, id); assert.equal(c.method, method); assert.deepEqual(c.args, args) }
async function signedTx(r: Report, id: string) {
  const c = row(r, id), v = returned(r, id), t = strictAtomic(v.tx, v.txid); assert.ok(await t.verify(tracker), `Invalid proof or script ${id}`)
  const matches = r.submissions.slice(c.submissionStart - r.submissionStart, c.submissionEnd - r.submissionStart).filter(s => s.txid === v.txid && s.verdict === 'ACCEPTED_BY_NETWORK')
  assert.ok(matches.length > 0, `No scoped accepted submission ${id}`)
  for (const s of matches) {
    assert.match(s.beefHex,/^(?:[0-9a-f]{2})+$/); const bytes=[...Buffer.from(s.beefHex,'hex')]; let sub:Transaction
    const prefix=Buffer.from(bytes.slice(0,4)).readUInt32LE()
    if([0xefbe0001,0xefbe0002,0x01010101].includes(prefix)){const reader=new Utils.Reader(bytes),b=Beef.fromReader(reader);assert.equal(reader.eof(),true);sub=b.findTxid(v.txid)?.tx!;assert.ok(sub)}else{sub=Transaction.fromHex(s.beefHex);assert.equal(sub.toHex(),s.beefHex)}
    assert.equal(sub.id('hex'),v.txid); assert.equal(sub.toHex(),t.toHex())
  }
  return t
}
async function settingsToken(r: Report, stage: 'original'|'temporary'|'restored') {
  const state = r.settings[stage], outputs = r.settings[`${stage}Outputs`]
  assert.ok(state && outputs); assert.equal(outputs.outputs.length, outputs.totalOutputs); assert.ok(outputs.totalOutputs <= 1)
  const read = r.trace.find(c => (stage!=='restored'||c.start>=row(r,'after-cleanup').end) && c.method === 'listOutputs' && c.args.basket === 'wallet settings' && !c.error && canonical(c.result) === canonical(outputs)); assert.ok(read)
  if (outputs.totalOutputs === 0) {
    assert.deepEqual(outputs.outputs, []); assert.equal(Beef.fromBinary(outputs.BEEF).txs.length, 0)
    if(stage==='restored') {
      const temporary=r.settings.temporaryOutputs;assert.equal(temporary.totalOutputs,1);assert.equal(temporary.outputs.length,1)
      const target=temporary.outputs[0].outpoint, [txid,index]=target.split('.')
      const stageCall=r.trace.find(c=>c.method==='createAction'&&!c.error&&c.start>=row(r,'after-cleanup').end&&c.args.inputs?.length===1&&c.args.inputs[0].outpoint===target&&c.args.outputs===undefined&&c.result?.signableTransaction?.reference);assert.ok(stageCall,'Missing public settings deletion staging')
      const final=r.trace.find(c=>c.method==='signAction'&&!c.error&&c.start>=stageCall.end&&c.args.reference===stageCall.result.signableTransaction.reference);assert.ok(final,'Missing public signed settings deletion')
      const deleted=await signedTx(r,final.id);assert.ok(deleted.inputs.some(input=>input.sourceTXID===txid&&input.sourceOutputIndex===Number(index)),'Deletion did not spend temporary settings token');assert.ok(final.end<=read.start,'Restored empty read precedes signed deletion')
    }
    return
  }
  const [id, index] = outputs.outputs[0].outpoint.split('.')
  const t = strictAtomic(Beef.fromBinary(outputs.BEEF).toBinaryAtomic(id), id); assert.ok(await t.verify(tracker))
  const decoded = PushDrop.decode(t.outputs[Number(index)]!.lockingScript)
  assert.equal(decoded.fields.length, 2); assert.ok(Signature.fromDER(decoded.fields[1]!).verify(decoded.fields[0]!, decoded.lockingPublicKey))
  const context = (c: any) => canonical(c.args.protocolID) === canonical([2, 'wallet settings']) && c.args.keyID === 'settings'
  const decrypt = r.trace.find(c => c.method === 'decrypt' && !c.error && context(c) && [undefined, 'self'].includes(c.args.counterparty) && canonical(c.args.ciphertext) === canonical(decoded.fields[0]) && (() => { try { return canonical(JSON.parse(Buffer.from(c.result.plaintext).toString())) === canonical(state) } catch { return false } })()); assert.ok(decrypt)
  if (stage !== 'original') {
    const write = r.trace.find(c => ['createAction', 'signAction'].includes(c.method) && c.result?.txid === id && !c.error); assert.ok(write); assert.equal((await signedTx(r, write.id)).toHex(), t.toHex())
    const key = r.trace.find(c => c.method === 'getPublicKey' && !c.error && context(c) && c.args.counterparty === 'self' && c.args.forSelf === false && c.result?.publicKey === decoded.lockingPublicKey.toString()); assert.ok(key)
    const sign = r.trace.find(c => c.method === 'createSignature' && !c.error && context(c) && c.args.counterparty === 'self' && canonical(c.args.data) === canonical(decoded.fields[0]) && canonical(c.result?.signature) === canonical(decoded.fields[1])); assert.ok(sign)
    assert.ok(key.end <= sign.start && sign.end <= write.start && write.end <= decrypt.start)
    if (stage === 'temporary') assert.ok(decrypt.end <= row(r, queryProgram(r.identity,r.issuer,r.nonce)[0]!.id).start)
    if (stage === 'restored') assert.ok(row(r,'after-cleanup').end <= write.start)
  }
}
export async function validateFixture(r: Report) {
  assert.equal(r.schema, schema); assert.equal(r.claim, 'ENGINEERING_OBSERVATION_ONLY'); assert.equal(r.completeBRC100Conformance, false)
  assert.ok(['REFERENCE','LAB_SELF_TEST_ONLY','NATIVE_OBSERVATION'].includes(r.mode)); assert.equal(r.errors.length, 0); assert.equal(r.lookupClosed, true)
  const config = fixtureConfig(r.nonce), issuer = new ProtoWallet(PrivateKey.fromHex(issuerKey)), publicVerifier = new ProtoWallet('anyone')
  assert.equal(r.issuer, (await issuer.getPublicKey({ identityKey: true })).publicKey)
  callArgs(r,'identity','getPublicKey',{identityKey:true}); assert.equal(returned(r,'identity').publicKey,r.identity)
  assert.ok(r.trace.length <= bounds.publicCalls); assert.equal(new Set(r.trace.map(c => c.id)).size,r.trace.length)
  assert.equal(r.submissions.length,r.submissionEnd-r.submissionStart)
  for (let i=0;i<r.trace.length;i++) { const c=r.trace[i]!; assert.ok(Number.isFinite(c.start)&&c.end>=c.start); if(i) assert.ok(r.trace[i-1]!.end<=c.start); assert.ok(c.submissionStart>=r.submissionStart&&c.submissionEnd>=c.submissionStart&&c.submissionEnd<=r.submissionEnd); assert.ok(!(c.result!==undefined&&c.error!==undefined)) }
  const nonhelpers=r.trace.filter(c=>!/^helper-[1-9][0-9]*$/.test(c.id)).map(c=>c.id)
  assert.deepEqual(nonhelpers,['identity','baseline',...Array.from({length:11},(_,i)=>[`acquire-${i}`,`proof-${i}`]).flat(),'publication',...queryProgram(r.identity,r.issuer,r.nonce).map(p=>p.id),...Array.from({length:11},(_,i)=>`cleanup-${i}`),'after-cleanup'])
  assert.ok(r.trace.filter(c=>c.id.startsWith('helper-')).every(c=>['getPublicKey','createSignature','encrypt','decrypt','listOutputs','createAction','signAction','abortAction'].includes(c.method)))
  const raw=Transaction.fromHex(r.anchor.rawTxHex); assert.equal(raw.toHex(),r.anchor.rawTxHex); const [anchorId,vout]=r.anchor.outpoint.split('.'); assert.equal(raw.id('hex'),anchorId); assert.ok(/^\d+$/.test(vout)&&raw.outputs[Number(vout)]); assert.match(r.anchor.sha256,/^[0-9a-f]{64}$/); assert.ok(typeof r.anchor.source==='string'&&r.anchor.source.length>0)
  const certificateArgs={certifiers:[r.issuer],types:[config.type],limit:10000}
  for(const id of ['baseline','after-cleanup']) {callArgs(r,id,'listCertificates',certificateArgs);assert.deepEqual(returned(r,id),{totalCertificates:0,certificates:[]});assert.equal(row(r,id).submissionStart,row(r,id).submissionEnd)}
  assert.equal(r.fixtures.length,11);assert.equal(r.publicCertificates.length,11);assert.equal(new Set(r.fixtures.map(tuple)).size,11)
  for(let i=0;i<11;i++) {
    const c=r.fixtures[i]!,p=r.publicCertificates[i]!
    assert.equal(c.subject,r.identity);assert.equal(c.certifier,r.issuer);assert.equal(c.type,config.type);assert.equal(c.serialNumber,config.serials[i]);assert.equal(c.revocationOutpoint,r.anchor.outpoint)
    assert.ok(await VerifiableCertificate.fromCertificate(c,{}).verify());assert.deepEqual(await MasterCertificate.decryptFields(issuer,c.masterKeyring,c.fields,r.identity),config.fields)
    callArgs(r,`acquire-${i}`,'acquireCertificate',{...c,acquisitionProtocol:'direct',keyringRevealer:'certifier',keyringForSubject:c.masterKeyring});assert.deepEqual(projection(returned(r,`acquire-${i}`)),projection(c))
    callArgs(r,`proof-${i}`,'proveCertificate',{certificate:{type:c.type,serialNumber:c.serialNumber,certifier:c.certifier},verifier:anyone,fieldsToReveal:['name']})
    assert.deepEqual(projection(p),projection(c));assert.deepEqual(Object.keys(p.keyring),['name']);assert.deepEqual(returned(r,`proof-${i}`).keyringForVerifier,p.keyring)
    assert.deepEqual(await VerifiableCertificate.fromCertificate(p,p.keyring).decryptFields(publicVerifier),{name:config.fields.name})
    callArgs(r,`cleanup-${i}`,'relinquishCertificate',{type:c.type,serialNumber:c.serialNumber,certifier:c.certifier});assert.deepEqual(returned(r,`cleanup-${i}`),{relinquished:true})
  }
  const tx=await signedTx(r,'publication'), args=row(r,'publication').args
  assert.equal(args.outputs.length,12);assert.deepEqual(args.options,{randomizeOutputs:false,acceptDelayedBroadcast:false})
  for(let i=0;i<12;i++) {
    const output=tx.outputs[i]!;assert.equal(output.satoshis,1);assert.equal(output.lockingScript.toHex(),args.outputs[i].lockingScript)
    const d=PushDrop.decode(output.lockingScript)
    // The evidence encoder sorts object keys. Compare certificate semantics,
    // then authenticate the original published bytes, never reconstructed JSON.
    const data=i<11?d.fields.slice(0,-1):[Utils.toArray('SLAP','utf8'),Utils.toArray(r.identity,'hex'),Utils.toArray('https://overlay.itcve.test','utf8'),Utils.toArray('ls_identity','utf8')]
    if(i<11){assert.equal(data.length,1);assert.deepEqual(JSON.parse(Utils.toUTF8(data[0]!)),r.publicCertificates[i])}
    assert.deepEqual(d.fields.slice(0,-1),data);assert.equal(d.fields.length,data.length+1)
    const protocolID:any=i<11?[1,'identity']:[2,'service lookup availability'];assert.equal((await publicVerifier.verifySignature({data:data.flat(),signature:d.fields.at(-1)!,protocolID,keyID:'1',counterparty:r.identity})).valid,true)
    assert.equal((await publicVerifier.getPublicKey({protocolID,keyID:'1',counterparty:r.identity})).publicKey,d.lockingPublicKey.toString())
  }
  assert.deepEqual(r.publication.receipt.tm_identity.outputsToAdmit,Array.from({length:11},(_,i)=>i));assert.deepEqual(r.publication.receipt.tm_slap.outputsToAdmit,[11])
  const answer=r.publication.answer;assert.equal(answer.type,'output-list');assert.equal(answer.outputs.length,11);assert.deepEqual([...answer.outputs.map((o:any)=>o.outputIndex)].sort((a,b)=>a-b),Array.from({length:11},(_,i)=>i))
  for(const o of answer.outputs) {assert.equal(Transaction.fromBEEF(o.beef).toHex(),tx.toHex())}
  const expected=structuredClone(r.settings.original);assert.ok(!expected.trustSettings.trustedCertifiers.some((c:any)=>c.identityKey===r.issuer));expected.trustSettings.trustedCertifiers.push({identityKey:r.issuer,...trust})
  assert.deepEqual(r.settings.temporary,expected);assert.deepEqual(r.settings.readback,expected);assert.deepEqual(r.settings.restored,r.settings.original)
  await settingsToken(r,'original');await settingsToken(r,'temporary');await settingsToken(r,'restored')
  const signed=r.trace.filter(c=>['createAction','signAction'].includes(c.method)&&c.result?.txid&&Array.isArray(c.result.tx));assert.ok(new Set(signed.map(c=>c.result.txid)).size<=bounds.uniqueSignedTransactions)
  return {txid:tx.id('hex'),certificates:11}
}
async function validateResult(r: Report, method: string, value: any) {
  assert.ok(Array.isArray(value.certificates));assert.equal(value.totalCertificates,11,'Prospective lab interpretation: totalCertificates counts full matching set before pagination')
  assert.equal(new Set(value.certificates.map(tuple)).size,value.certificates.length,'Duplicate certificate')
  for(const c of value.certificates) {
    const index=r.fixtures.findIndex(f=>tuple(f)===tuple(c));assert.ok(index>=0,'Unpublished or extra certificate');assert.deepEqual(projection(c),projection(r.fixtures[index]));assert.ok(await VerifiableCertificate.fromCertificate(c,{}).verify())
    if(method!=='listCertificates') {assert.deepEqual(c.publiclyRevealedKeyring,r.publicCertificates[index].keyring);assert.deepEqual(await VerifiableCertificate.fromCertificate(c,c.publiclyRevealedKeyring).decryptFields(new ProtoWallet('anyone')),{name:fixtureConfig(r.nonce).fields.name});assert.deepEqual(c.decryptedFields,{name:fixtureConfig(r.nonce).fields.name});assert.equal(c.certifierInfo.name,trust.name);assert.equal(c.certifierInfo.description,trust.description);assert.equal(c.certifierInfo.trust,trust.trust)}
  }
  return value.certificates.map(tuple) as string[]
}
function validateLookup(r: Report, id: string, method: string) {
  if(method==='listCertificates')return
  const calls=r.lookup.filter(q=>q.id===id&&q.question.service==='ls_identity');assert.ok(calls.length>0,'No actual controlled lookup for forced refresh')
  const certifiers=r.settings.temporary.trustSettings.trustedCertifiers.map((c:any)=>c.identityKey).sort()
  for(const q of calls){
    assert.deepEqual(q.question.query,method==='discoverByIdentityKey'?{identityKey:r.identity,certifiers}:{attributes:{name:fixtureConfig(r.nonce).fields.name},certifiers})
    assert.equal(q.answer.type,'output-list');assert.equal(q.answer.outputs.length,11)
    assert.deepEqual([...q.answer.outputs.map((o:any)=>o.outputIndex)].sort((a,b)=>a-b),Array.from({length:11},(_,i)=>i))
    for(const o of q.answer.outputs){
      const reader=new Utils.Reader(o.beef);Beef.fromReader(reader);assert.equal(reader.eof(),true,'Trailing lookup BEEF')
      const tx=Transaction.fromBEEF(o.beef);assert.equal(tx.id('hex'),returned(r,'publication').txid);assert.equal(tx.toHex(),strictAtomic(returned(r,'publication').tx,returned(r,'publication').txid).toHex())
    }
  }
}
export async function evaluatePagination(r: Report) {
  const outcomes:any[]=[], check=async(id:string,fn:()=>Promise<void>)=>{try{await fn();outcomes.push({id,result:'BLOCKED',localChecks:'SATISFIED',detail:'Scoped cryptographic and pagination predicates matched; complete native parent admission is required.'})}catch(e){outcomes.push({id,result:'FAIL',localChecks:'REJECTED',detail:e instanceof Error?e.message:String(e)})}}
  await check('fixture',async()=>{await validateFixture(r)})
  const ids=methods.flatMap(method=>[...variants.slice(0,7).map(([v])=>`${method}/${v}`),`${method}/page-union-control`])
  if(outcomes[0].result==='FAIL')return{claim:'LOCAL_DIAGNOSTIC_ONLY',acceptedNativeAssertions:0,outcomes:[...outcomes,...ids.map(id=>({id,result:'BLOCKED',localChecks:'UNAVAILABLE',detail:'Fixture prerequisite failed'}))]}
  const program=queryProgram(r.identity,r.issuer,r.nonce)
  for(const method of methods){
    const max=program.find(p=>p.id===`${method}/max-limit10000`)!
    const full=async()=>{callArgs(r,max.id,max.method,max.args);const all=await validateResult(r,method,returned(r,max.id));assert.equal(all.length,11);assert.deepEqual([...all].sort(),r.fixtures.map(tuple).sort());assert.equal(row(r,max.id).submissionStart,row(r,max.id).submissionEnd);validateLookup(r,max.id,method);return all}
    for(const [variant,paging] of variants.slice(0,7))await check(`${method}/${variant}`,async()=>{
      const p=program.find(p=>p.id===`${method}/${variant}`)!,all=await full()
      callArgs(r,p.id,p.method,p.args)
      const actual=await validateResult(r,method,returned(r,p.id));assert.deepEqual(actual,all.slice('offset'in paging?paging.offset:0,('offset'in paging?paging.offset:0)+('limit'in paging?paging.limit:10)),'Page differs from this method’s observed max-limit order')
      assert.equal(row(r,p.id).submissionStart,row(r,p.id).submissionEnd);validateLookup(r,p.id,method)
    })
    await check(`${method}/page-union-control`,async()=>{
      const all=await full()
      for(const suffix of ['union-first','union-last']) {const q=program.find(p=>p.id===`${method}/${suffix}`)!;callArgs(r,q.id,q.method,q.args);assert.equal(row(r,q.id).submissionStart,row(r,q.id).submissionEnd);validateLookup(r,q.id,method)}
      const first=await validateResult(r,method,returned(r,`${method}/union-first`)),last=await validateResult(r,method,returned(r,`${method}/union-last`));assert.equal(first.length,6);assert.equal(last.length,5);assert.deepEqual([...first,...last],all);assert.equal(new Set([...first,...last]).size,11)
    })
  }
  return{claim:'LOCAL_DIAGNOSTIC_ONLY',acceptedNativeAssertions:0,outcomes}
}
