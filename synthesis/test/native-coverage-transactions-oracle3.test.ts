import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { describe, it, expect } from 'vitest'
import { getTransactionCoveragePolicy, transactionCoverageIds, type TransactionCoverageReport as Report } from '../src/wallet-lab/native/coverage-transactions-model.js'
import { deriveTransactionCoverageOutcomes } from '../src/wallet-lab/native/coverage-transactions-verifier.js'
const archive = path.resolve(import.meta.dirname, '../../journals/integrated-native-attempts/2026-11-12/43216478235/native-integrated.zip')
const originals: Report[] = JSON.parse(execFileSync('python3', ['-c', "import json,sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); print(json.dumps([json.loads(z.read(f'repetition-{n}/evidence/conformance/coverage-transactions.json')) for n in (1,2)]))", archive], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }))
const policy = getTransactionCoveragePolicy(3)
const prospective = (index = 0): Report => ({ ...structuredClone(originals[index]!), schema: 'tpnil-native-coverage-transactions@3.0.0', oracle: policy.policy.oracle, policySha256: policy.policySha256 })
const call = (r: Report, id: string) => r.trace.find(row => row.id === id)!
const entry = (r: Report, index: number) => r.submissions[index - r.submissionStart]!
const replace = (r: Report, index: number, id: string) => { const source = call(r, id); r.submissions[index - r.submissionStart] = { txid: source.result.txid, beefHex: Buffer.from(source.result.tx).toString('hex'), verdict: 'ACCEPTED_BY_NETWORK' } }
const outcome = async (r: Report, suffix: string) => (await deriveTransactionCoverageOutcomes(r)).find(row => row.id.endsWith('/' + suffix))!

describe('prospective transaction oracle3 with unchanged failed native6 captures', () => {
  it('pins the immutable original ZIP and preserves both oracle2 failures', async () => {
    expect(createHash('sha256').update(fs.readFileSync(archive)).digest('hex')).toBe('6701efea0672ddf069796dfd96b221ae21415fbc478871a97b8be0c9449aad23')
    for (const r of originals) {
      const derived = await deriveTransactionCoverageOutcomes(structuredClone(r))
      expect(derived).toEqual(r.assertions)
      expect(derived.filter(row => row.result === 'FAIL').map(row => row.id)).toEqual(['transaction.batch-send/two-dependent-held', 'transaction.batch-send/sign-sendWith', 'transaction.nosend-change/valid-subset'])
    }
  }, 30_000)
  it.each([0, 1])('separately re-evaluates repetition %i without a native admission claim', async index => {
    const r = prospective(index), derived = await deriveTransactionCoverageOutcomes(r)
    expect(derived.map(row => row.id)).toEqual(transactionCoverageIds)
    expect(derived.filter(row => row.result === 'PASS')).toHaveLength(21)
    expect(derived.filter(row => row.result === 'FAIL')).toHaveLength(0)
    expect(derived.filter(row => row.result === 'BLOCKED')).toHaveLength(1)
    expect(r.completeBRC100Conformance).toBe(false); expect(r.claim).toBe('ENGINEERING_OBSERVATION_ONLY'); expect(r.trace).toHaveLength(121)
  }, 30_000)
  it('rejects the held target itself appearing before its release', async () => {
    const r = prospective(); replace(r, call(r, 'held-b').submissionStart, 'held-b')
    expect((await outcome(r, 'sign-sendWith')).result).toBe('FAIL')
  }, 30_000)
  it('rejects a held parent exposed as an ancestor of an early descendant', async () => {
    const r = prospective(); replace(r, call(r, 'held-b').submissionStart, 'held-child')
    const result = await outcome(r, 'two-dependent-held')
    expect(result.result).toBe('FAIL'); expect(result.detail).toContain('submission ancestry before its exact release')
  }, 30_000)
  it.each(['foreign-owner-sign', 'fanout'])('does not exempt an unrelated prior %s transaction', async id => {
    const r = prospective(); replace(r, call(r, 'held-b').submissionStart, id)
    const result = await outcome(r, 'sign-sendWith')
    expect(result.result).toBe('FAIL'); expect(result.detail).toContain('exact prior delayed default controls')
  }, 30_000)
  it('does not exempt a rejected delayed-default receipt', async () => {
    const r = prospective(); entry(r, call(r, 'held-b').submissionStart).verdict = 'REJECTED'
    expect((await outcome(r, 'sign-sendWith')).result).toBe('FAIL')
  }, 30_000)
  it('does not exempt a prior delayed-default result with a failed status', async () => {
    const r = prospective(); call(r, 'default-create-omitted').result.sendWithResults[0].status = 'failed'
    expect((await outcome(r, 'sign-sendWith')).result).toBe('FAIL')
  }, 30_000)
  it('does not exempt an unsigned earlier default result', async () => {
    const r = prospective(); delete call(r, 'default-create-omitted').result.tx
    expect((await outcome(r, 'sign-sendWith')).result).toBe('FAIL')
  }, 30_000)
  it('rejects swapped submitted bytes even if the declared default TXID stays unchanged', async () => {
    const r = prospective(); entry(r, call(r, 'held-b').submissionStart).beefHex = Buffer.from(call(r, 'fanout').result.tx).toString('hex')
    await expect(deriveTransactionCoverageOutcomes(r)).rejects.toThrow()
  })
  it('requires the exact release request, not an unrelated sendWith list', async () => {
    const r = prospective(); call(r, 'batch-sign').args.options.sendWith = []
    await expect(deriveTransactionCoverageOutcomes(r)).rejects.toThrow()
  })
  it('keeps the prospective policy explicitly separate from revision2', () => {
    const previous = getTransactionCoveragePolicy(2)
    expect(policy.policy.predecessor.sha256).toBe(previous.policySha256)
    expect(policy.policy.nativeRun).toBeNull(); expect(policy.policy.variantIds).toEqual(previous.policy.variantIds); expect(policy.policy.bounds).toEqual(previous.policy.bounds)
  })
})

import {decodeCoverageObservation,coverageObservationEncoding} from '../src/wallet-lab/native/coverage-observation.js'
import {bindForeignOwnerFixture} from '../src/wallet-lab/native/coverage-transactions-verifier.js'
// Original bytes test only the receipt join. Full module/funding verification is
// separately required by the native parent; these constructed receipts grant no admission.
const native14 = path.resolve(import.meta.dirname,'../../journals/integrated-native-attempts/2026-11-13/43346773141')
const crossModule = JSON.parse(execFileSync('python3',['-c',`import io,json,sys,zipfile,hashlib,pathlib
p=pathlib.Path(sys.argv[1]);m=json.loads((p/'attempt.json').read_bytes());b=b''.join((p/n).read_bytes()for n in m['originalArchive']['parts']);assert 'sha256:'+hashlib.sha256(b).hexdigest()==m['originalArchive']['digest'];z=zipfile.ZipFile(io.BytesIO(b));print(json.dumps([json.loads(z.read('repetition-1/evidence/'+n))for n in ['conformance/coverage-transactions.json','conformance/coverage-extension.json','native-submissions.json']]))`,native14],{encoding:'utf8',maxBuffer:64*1024*1024}))
function ownerFixture() {const [report,encoded,ledger]=structuredClone(crossModule);return {report,external:decodeCoverageObservation<any>(encoded,coverageObservationEncoding),ledger}}
it('joins only the exact next fixed controlled-funder fixture after both parents verify',()=>{
 const f=ownerFixture(),r=bindForeignOwnerFixture(f.report,f.external,{verified:true},{verified:true},f.ledger)!
 expect(r.outpoint).toBe(f.report.trace.find((r:any)=>r.id==='change-foreign').args.options.noSendChange[0]);expect(r.positions).toEqual([101,104])
 expect(r.start).toBeGreaterThanOrEqual(f.report.submissionEnd)
})
it.each(['actor','call-id','identity','oracle','parent','funding','body','receipt-verdict','window'] as const)('rejects substituted cross-module owner %s',kind=>{
 const f=ownerFixture(),row=f.external.trace.find((r:any)=>r.id==='fixture-external'),parent={verified:true as const},funding={verified:true as const}
 if(kind==='actor')row.actor='wallet'
 if(kind==='call-id')row.id='another-owner'
 if(kind==='identity')f.external.identity='foreign'
 if(kind==='oracle')f.external.oracle='tpnil-native-coverage-extension-oracle@3.0.0'
 if(kind==='parent')Object.assign(parent,{verified:false})
 if(kind==='funding')Object.assign(funding,{verified:false})
 if(kind==='body')row.result.tx.push(0)
 if(kind==='receipt-verdict')f.ledger[row.submissionStart].verdict='REJECTED'
 if(kind==='window')f.external.submissionStart=f.report.submissionEnd-1
 expect(()=>bindForeignOwnerFixture(f.report,f.external,parent,funding,f.ledger)).toThrow()
})
