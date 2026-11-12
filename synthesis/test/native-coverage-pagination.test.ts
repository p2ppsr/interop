import fs from 'node:fs'
import {gunzipSync} from 'node:zlib'
import { createHash } from 'node:crypto'
import { beforeAll, describe, expect, test } from 'vitest'
import { methods, variants, type Report } from '../src/wallet-lab/native/coverage-completion/pagination-model.js'
import { encodeCoverageObservation, decodeCoverageObservation, coverageObservationEncoding } from '../src/wallet-lab/native/coverage-observation.js'
import { evaluatePagination } from '../src/wallet-lab/native/coverage-completion/pagination-verifier.js'
const rawBytes=gunzipSync(fs.readFileSync(new URL('./fixtures/native-pagination/report.json.gz',import.meta.url))),historical=JSON.parse(rawBytes.toString()),raw:Report={...historical,schema:'tpnil-native-pagination@1.0.0',claim:'ENGINEERING_OBSERVATION_ONLY'}
export const rawSha256=createHash('sha256').update(rawBytes).digest('hex')
const call=(r:Report,id:string)=>r.trace.find(c=>c.id===id)!
export function coherentSelfTest():Report {
  const r:Report=structuredClone(raw);r.mode='LAB_SELF_TEST_ONLY'
  for(const method of methods){const all=call(r,`${method}/max-limit10000`).result.certificates;for(const [variant,p]of variants){const from='offset'in p?p.offset:0,limit='limit'in p?p.limit:10;call(r,`${method}/${variant}`).result={totalCertificates:11,certificates:structuredClone(all.slice(from,from+limit))}}}
  return r
}
let coherent:Report
beforeAll(()=>{coherent=coherentSelfTest()})
describe('Pagination cryptographic and page predicates',()=>{
 test('actual source report stays immutable and exposes discovery pagination failure',async()=>{
  const r=await evaluatePagination(raw)
  expect(r.outcomes.filter(o=>o.result==='FAIL')).toHaveLength(14)
  expect(r.outcomes.filter(o=>o.localChecks==='SATISFIED')).toHaveLength(11)
  expect(r.acceptedNativeAssertions).toBe(0)
  expect(createHash('sha256').update(gunzipSync(fs.readFileSync(new URL('./fixtures/native-pagination/report.json.gz',import.meta.url)))).digest('hex')).toBe(rawSha256)
 },30000)
 test('coherent 11-item pages remain BLOCKED, including when mode is relabeled native',async()=>{
  for(const mode of ['LAB_SELF_TEST_ONLY','REFERENCE','NATIVE_OBSERVATION'] as const){const r=structuredClone(coherent);r.mode=mode;const v=await evaluatePagination(r);expect(v.outcomes).toHaveLength(25);expect(v.outcomes.every(o=>o.result==='BLOCKED'&&o.localChecks==='SATISFIED')).toBe(true);expect(v.acceptedNativeAssertions).toBe(0)}
 },30000)
 test('canonical persisted observation preserves signed publication bytes and outcomes',async()=>{
  const before=await evaluatePagination(coherent)
  const persisted=JSON.parse(JSON.stringify(encodeCoverageObservation(coherent)))
  const after=await evaluatePagination(decodeCoverageObservation<Report>(persisted,coverageObservationEncoding))
  expect(after).toEqual(before)
 },30000)
 test('uses each method own returned order without imposing issuer/serial order',async()=>{
  const r=structuredClone(coherent)
  for(const method of methods){const all=[...call(r,`${method}/max-limit10000`).result.certificates].reverse();for(const [v,p]of variants){const from='offset'in p?p.offset:0,limit='limit'in p?p.limit:10;call(r,`${method}/${v}`).result.certificates=all.slice(from,from+limit)}}
  expect((await evaluatePagination(r)).outcomes.every(o=>o.result==='BLOCKED'&&o.localChecks==='SATISFIED')).toBe(true)
 },30000)
 const mutations:Array<[string,(r:Report)=>void,string]>=[
  ['reordered named calls',r=>{[r.trace[0],r.trace[1]]=[r.trace[1]!,r.trace[0]!] },'fixture'],
  ['wrong identity',r=>{r.identity=r.issuer},'fixture'],
  ['duplicate fixture',r=>{r.fixtures[1]=r.fixtures[0]},'fixture'],
  ['invalid certificate signature',r=>{r.fixtures[0].signature='00'.repeat(70)},'fixture'],
  ['wrong acquire arguments',r=>{call(r,'acquire-0').args.acquisitionProtocol='issuance'},'fixture'],
  ['wrong proof keyring',r=>{call(r,'proof-0').result.keyringForVerifier.name='AA=='},'fixture'],
  ['undeclared revelation',r=>{r.publicCertificates[0].keyring.private='AA=='},'fixture'],
  ['trailing signed publication',r=>{call(r,'publication').result.tx.push(0)},'fixture'],
  ['sparse signed publication',r=>{delete call(r,'publication').result.tx[4]},'fixture'],
  ['substituted anchor',r=>{r.anchor.outpoint='00'.repeat(32)+'.0'},'fixture'],
  ['wrong settings readback',r=>{r.settings.readback.trustSettings.trustedCertifiers=[]},'fixture'],
  ['restored inventory contradiction',r=>{r.settings.restoredOutputs.outputs.push({outpoint:'00'.repeat(32)+'.0'})},'fixture'],
  ['wrong deletion source',r=>{call(r,'helper-36').args.inputs[0].outpoint='00'.repeat(32)+'.0'},'fixture'],
  ['wrong deletion reference',r=>{call(r,'helper-38').args.reference='wrong'},'fixture'],
  ['deletion read occurs too early',r=>{call(r,'helper-40').start=call(r,'helper-36').start},'fixture'],
  ['deletion without accepted receipt',r=>{const id=call(r,'helper-38').result.txid;for(const x of r.submissions)if(x.txid===id)x.verdict='REJECTED'},'fixture'],
  ['deletion excludes its submission window',r=>{const c=call(r,'helper-38');c.submissionEnd=c.submissionStart},'fixture'],
  ['missing overlay admission',r=>{r.publication.receipt.tm_identity.outputsToAdmit.pop()},'fixture'],
  ['contradictory public error',r=>{call(r,'listCertificates/limit1').error={message:'error'}},'fixture'],
  ['wrong total',r=>{call(r,'listCertificates/default-limit10').result.totalCertificates=10},'listCertificates/default-limit10'],
  ['wrong default size',r=>{call(r,'listCertificates/default-limit10').result.certificates.pop()},'listCertificates/default-limit10'],
  ['offset1 repeats first page',r=>{call(r,'listCertificates/offset1').result=call(r,'listCertificates/offset0').result},'listCertificates/offset1'],
  ['beyond-end returns an item',r=>{call(r,'listCertificates/beyond-end').result.certificates=[r.fixtures[0]]},'listCertificates/beyond-end'],
  ['duplicate page certificate',r=>{const c=call(r,'listCertificates/default-limit10').result.certificates;c[1]=c[0]},'listCertificates/default-limit10'],
  ['truncated full inventory',r=>{call(r,'listCertificates/max-limit10000').result.certificates.pop()},'listCertificates/max-limit10000'],
  ['altered query limit',r=>{call(r,'listCertificates/limit1').args.limit=2},'listCertificates/limit1'],
  ['wrong certificate fields',r=>{call(r,'listCertificates/limit1').result.certificates[0].fields.name='AA=='},'listCertificates/limit1'],
  ['duplicated union',r=>{call(r,'listCertificates/union-last').result.certificates[0]=call(r,'listCertificates/union-first').result.certificates[0]},'listCertificates/page-union-control'],
  ['bad discovery revelation',r=>{call(r,'discoverByIdentityKey/limit1').result.certificates[0].publiclyRevealedKeyring.name='AA=='},'discoverByIdentityKey/limit1'],
  ['invented decrypted field',r=>{call(r,'discoverByAttributes/limit1').result.certificates[0].decryptedFields.name='invented'},'discoverByAttributes/limit1'],
  ['wrong certifier trust',r=>{call(r,'discoverByAttributes/limit1').result.certificates[0].certifierInfo.trust=10},'discoverByAttributes/limit1'],
  ['missing actual lookup',r=>{r.lookup=r.lookup.filter(x=>x.id!=='discoverByAttributes/limit1')},'discoverByAttributes/limit1'],
  ['wrong lookup question',r=>{r.lookup.find(x=>x.id==='discoverByAttributes/limit1').question.query.attributes.name='wrong'},'discoverByAttributes/limit1'],
  ['missing lookup certificate',r=>{r.lookup.find(x=>x.id==='discoverByIdentityKey/limit1').answer.outputs.pop()},'discoverByIdentityKey/limit1'],
  ['trailing lookup BEEF',r=>{r.lookup.find(x=>x.id==='discoverByIdentityKey/limit1').answer.outputs[0].beef.push(0)},'discoverByIdentityKey/limit1'],
  ['query caused provider submission',r=>{const c=call(r,'listCertificates/limit1');c.submissionStart--},'listCertificates/limit1']
 ]
 test.each(mutations)('rejects %s',async(_name,mutate,id)=>{const r=structuredClone(coherent);mutate(r);expect((await evaluatePagination(r)).outcomes.find(o=>o.id===id)?.result).toBe('FAIL')},30000)
})
