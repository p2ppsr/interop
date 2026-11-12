import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { canonicalJson } from '../src/determinism.js'
import { validateNativeActionQueryCuts, validateNativeActionQueryFinalLedger } from '../src/wallet-lab/native-action-query-ledger.js'
const live = JSON.parse(fs.readFileSync(new URL('./fixtures/native-action-query-ledger/live.json', import.meta.url), 'utf8'))
const envelopes: any[] = JSON.parse(fs.readFileSync(new URL('./fixtures/native-action-query-ledger/rpc-envelope-corpus.json', import.meta.url), 'utf8'))
const wdkArguments: Array<{ input: string; typedJSON?: string; error?: string }> = JSON.parse(fs.readFileSync(new URL('./fixtures/native-action-query-ledger/wdk-args.json', import.meta.url), 'utf8'))
const final = JSON.parse(fs.readFileSync(new URL('./fixtures/native-action-query-ledger/final.json', import.meta.url), 'utf8'))
const hash = (b: Buffer | string) => createHash('sha256').update(b).digest('hex')
const verify = (v: any) => validateNativeActionQueryCuts(v, live.identityKey, live.providerIdentityKey)
function reseal(v: any): void {
  for (const entry of v.entries) { const raw = Buffer.from(JSON.stringify(entry)); v.entryBase64[String(entry.sequence)] = raw.toString('base64'); v.index.find((r: any) => r.sequence === entry.sequence).sha256 = hash(raw) }
  v.entriesSha256 = hash(`[${v.entries.map((entry: any) => Buffer.from(v.entryBase64[String(entry.sequence)], 'base64').toString()).join(',')}]`)
}
function changeInventory(v: any, alter: (inventory: any) => void): void {
  const cut = v.entries[0].providerCalls[0].cut, old = cut.before.sha256
  const value = JSON.parse(Buffer.from(v.blobs[old], 'base64').toString()); alter(value)
  const bytes = Buffer.from(JSON.stringify(value)), ref = { sha256: hash(bytes), bytes: bytes.length }
  delete v.blobs[old]; v.blobs[ref.sha256] = bytes.toString('base64'); cut.before = ref; cut.after = ref; reseal(v)
}
describe('actual authenticated Go action ledger retained bytes', () => {
  it('survives EvidenceBundle canonical key sorting for live and finalized records', () => {
    expect(verify(JSON.parse(canonicalJson(live)))).toEqual(live)
    expect(validateNativeActionQueryFinalLedger(JSON.parse(canonicalJson(final)), live.providerIdentityKey)).toEqual(final)
    expect(live.entries[0].rpcProviderBound).toBe(true); expect(live.entries[0].cwiJoin).toBe('UNAVAILABLE')
  })
  it.each(['missing', 'changed', 'swapped', 'extra'])('rejects%s exact raw entry bytes', mode => {
    const v = structuredClone(live)
    if (mode === 'missing') delete v.entryBase64['1']
    if (mode === 'changed') v.entryBase64['1'] = Buffer.from('{}').toString('base64')
    if (mode === 'swapped') v.entries[0].requestSequence++
    if (mode === 'extra') v.entryBase64['2'] = v.entryBase64['1']
    expect(() => verify(v)).toThrow()
  })
  it.each(['user_id', 'status', 'deleted_at', 'reference', 'tx_id'])('rejects%s inventory omission even with all blob/index hashes resealed', column => {
    const v = structuredClone(live)
    changeInventory(v, value => { const table = value.tables.actions, i = table.columns.indexOf(column); table.columns.splice(i, 1); table.rows.forEach((row: any[]) => row.splice(i, 1)) })
    expect(() => verify(v)).toThrow(/columns differ/)
  })
  it('rejects reordered columns and a foreign provider in an otherwise stable resealed cut', () => {
    for (const mode of ['reorder', 'provider']) {
      const v = structuredClone(live); changeInventory(v, value => { if (mode === 'reorder') value.tables.actions.columns.reverse(); else value.providerIdentityKey = live.identityKey })
      expect(() => verify(v)).toThrow()
    }
  })
  it.each(['missing-entry', 'changed-journal', 'missing-blob', 'wrong-provider', 'duplicate-sequence'])('rejects final%s', mode => {
    const v = structuredClone(final)
    if (mode === 'missing-entry') v.final.entryCount = 0
    if (mode === 'changed-journal') v.journalBase64 = Buffer.from('{}\n').toString('base64')
    if (mode === 'missing-blob') delete v.blobs[Object.keys(v.blobs)[0]!]
    if (mode === 'wrong-provider') v.final.providerIdentityKey = live.identityKey
    if (mode === 'duplicate-sequence') { const line = Buffer.from(v.journalBase64, 'base64').toString().trim(); v.journalBase64 = Buffer.from(line + '\n' + line + '\n').toString('base64'); v.final.entryCount = 2; v.final.entriesSha256 = hash(`[${line},${line}]`) }
    expect(() => validateNativeActionQueryFinalLedger(v, live.providerIdentityKey)).toThrow()
  })
  it.each(['rpc-id', 'result'])('rejects distinct raw large-number %s values despite JavaScript rounding and resealed hashes', kind => {
    const v = structuredClone(live), e = v.entries[0]
    const request = JSON.parse(Buffer.from(v.blobs[e.requestBody.sha256], 'base64').toString()), response = JSON.parse(Buffer.from(v.blobs[e.responseBody.sha256], 'base64').toString())
    if (kind === 'rpc-id') { request.id = 9007199254740992; response.id = '__UNSAFE_NUMBER__'; e.rpcId = 9007199254740992 }
    else { response.result.totalActions = '__UNSAFE_NUMBER__'; e.providerCalls[0].result.totalActions = 9007199254740992 }
    for (const [field, value] of [['requestBody', request], ['responseBody', response]] as const) {
      const text = JSON.stringify(value).replace('"__UNSAFE_NUMBER__"', '9007199254740993'), raw = Buffer.from(text)
      delete v.blobs[e[field].sha256]; e[field] = { sha256: hash(raw), bytes: raw.length }; v.blobs[hash(raw)] = raw.toString('base64')
    }
    reseal(v); expect(() => verify(v)).toThrow()
  })
  it.each(['rpc-id', 'result'])('retains matching exact large-number %s tokens without inventing a numeric-range rule', kind => {
    const v = structuredClone(live), e = v.entries[0]
    const request = JSON.parse(Buffer.from(v.blobs[e.requestBody.sha256], 'base64').toString()), response = JSON.parse(Buffer.from(v.blobs[e.responseBody.sha256], 'base64').toString())
    if (kind === 'rpc-id') { request.id = '__EXACT_NUMBER__'; response.id = '__EXACT_NUMBER__'; e.rpcId = '__EXACT_NUMBER__' }
    else { response.result.totalActions = '__EXACT_NUMBER__'; e.providerCalls[0].result.totalActions = '__EXACT_NUMBER__' }
    const exact = (value: any) => JSON.stringify(value).replaceAll('"__EXACT_NUMBER__"', '9007199254740993')
    for (const [field, value] of [['requestBody', request], ['responseBody', response]] as const) {
      const raw = Buffer.from(exact(value)); delete v.blobs[e[field].sha256]; e[field] = { sha256: hash(raw), bytes: raw.length }; v.blobs[hash(raw)] = raw.toString('base64')
    }
    const raw = Buffer.from(exact(e)); v.entryBase64['1'] = raw.toString('base64'); v.entries[0] = JSON.parse(raw.toString()); v.index[0].sha256 = hash(raw); v.entriesSha256 = hash(`[${raw.toString()}]`)
    expect(verify(v).entries[0]!.rpcProviderBound).toBe(true)
    // This proves exact observer correlation only, not validity of a wallet's
    // amount/count or JSON-RPC identifier under a separate CWI predicate.
  })
  it.each(wdkArguments.map((row, index) => ({ ...row, index })))('matches actual pinned Go WDK typed projection case $index', row => {
    const v = structuredClone(live), e = v.entries[0]
    const request = JSON.parse(Buffer.from(v.blobs[e.requestBody.sha256], 'base64').toString()); request.params[1] = '__RAW_ARGS__'
    const raw = Buffer.from(JSON.stringify(request).replace('"__RAW_ARGS__"', row.input))
    delete v.blobs[e.requestBody.sha256]; v.blobs[hash(raw)] = raw.toString('base64'); e.requestBody = { sha256: hash(raw), bytes: raw.length }
    e.providerCalls[0].args = '__TYPED_ARGS__'
    const encoded = Buffer.from(JSON.stringify(e).replace('"__TYPED_ARGS__"', row.typedJSON ?? '{"labels":null,"labelQueryMode":null}'))
    v.entryBase64['1'] = encoded.toString('base64'); v.entries[0] = JSON.parse(encoded.toString()); v.index[0].sha256 = hash(encoded); v.entriesSha256 = hash(`[${encoded.toString()}]`)
    if (row.error) expect(() => verify(v)).toThrow()
    else expect(verify(v).entries[0]!.rpcProviderBound).toBe(true)
  })
  it.each(['labels', 'limit', 'offset', 'includeInputs', 'labelQueryMode', 'seekPermission'])('rejects resealed raw RPC %s argument substitution', field => {
    const v = structuredClone(live), e = v.entries[0], request = JSON.parse(Buffer.from(v.blobs[e.requestBody.sha256], 'base64').toString())
    request.params[1][field] = ({ labels: ['different request'], limit: 99, offset: 2, includeInputs: true, labelQueryMode: 'all', seekPermission: false } as any)[field]
    const bytes = Buffer.from(JSON.stringify(request)); delete v.blobs[e.requestBody.sha256]; e.requestBody = { sha256: hash(bytes), bytes: bytes.length }; v.blobs[hash(bytes)] = bytes.toString('base64'); reseal(v)
    expect(() => verify(v)).toThrow(/Raw RPC arguments differ/)
  })
  it.each(envelopes)('matches actual Go authenticated RPC envelope correlation: $name', row => {
    const v = structuredClone(live), e = v.entries[0]
    for (const [field, text] of [['requestBody', row.request], ['responseBody', row.response]] as const) {
      const raw = Buffer.from(text); delete v.blobs[e[field].sha256]; e[field] = { sha256: hash(raw), bytes: raw.length }; v.blobs[hash(raw)] = raw.toString('base64')
    }
    e.providerCalls[0] = structuredClone(row.observation); e.rpcId = row.rpcId; e.rpcMethod = row.rpcMethod; reseal(v)
    if (row.expectedBound) expect(verify(v).entries[0]!.rpcProviderBound).toBe(true)
    else expect(() => verify(v)).toThrow()
  })
  it('retains an explicit terminal failure without converting it to an admitted empty-error ledger', () => {
    const v = structuredClone(final); v.final.terminalErrors = ['synthetic retention failure']
    expect(validateNativeActionQueryFinalLedger(v).final.terminalErrors).toEqual(v.final.terminalErrors)
    // Final admission is deliberately separate and must require this list empty.
  })
})
