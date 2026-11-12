import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { PrivateKey, ProtoWallet } from '@bsv/sdk'
import { afterEach, expect, it, vi } from 'vitest'
import { captureNativeSafeBoundary } from '../src/wallet-lab/yours-driver.js'
import { runWalletBoundaryCorpus, type BoundaryWallet } from '../src/wallet-lab/boundary-corpus.js'
import { verifyBoundaryCorpus } from '../src/wallet-lab/verify-boundary.js'
import { controlledHeaderFixture, controlledHeaderAssertion, getControlledHeaderFixture } from '../src/wallet-lab/native/controlled-header-fixture.js'

const selected = getControlledHeaderFixture(controlledHeaderFixture)
afterEach(() => vi.unstubAllGlobals())

function cryptoBoundary(header: (args: any) => Promise<any>) {
  const proto = new ProtoWallet(PrivateKey.fromHex('77'.repeat(32))), calls: string[] = []
  const wallet = new Proxy({} as BoundaryWallet, { get: (_target, method: string) => async (args: any) => {
    calls.push(method)
    if (method === 'getHeight') return { height: 900100 }
    if (method === 'getHeaderForHeight') return header(args)
    return (proto as any)[method](args)
  } })
  vi.stubGlobal('window', { CWI: wallet })
  return calls
}

// LAB_SELF_TEST_ONLY: unrelated methods deliberately fail. This exercises the
// actual producer/verifier and42-ID inventory without inventing native results.
async function corpus(header: (args: any) => Promise<any>, positive = true) {
  const wallet = new Proxy({} as BoundaryWallet, { get: (_target, method: string) => async (args: any) => {
    if (method === 'getHeaderForHeight') return header(args)
    throw new Error('Rejected fixture operation')
  } })
  return runWalletBoundaryCorpus({ wallet, funder: wallet, prepareDiscovery: async () => {}, fixtureRevision: 2,
    ...(positive ? { headerFixture: controlledHeaderFixture } : {}) })
}
const validHeader = async ({ height }: any) => {
  if (height !== 1) throw new Error('The height parameter must be at least1')
  return { header: selected.header }
}

it('pins the positive header to exact retained funding bytes', () => {
  const bytes = fs.readFileSync(path.resolve(import.meta.dirname, '../../fixtures/teranode/wab-funding-v1.json'))
  const fixture = JSON.parse(bytes.toString())
  expect(selected.fixtureSha256).toBe(createHash('sha256').update(bytes).digest('hex'))
  expect(selected.height).toBe(1); expect(selected.height).toBe(fixture.fundingHeight)
  expect(selected.header).toBe(fixture.blockHeaderHex)
  expect(() => getControlledHeaderFixture('unknown' as any)).toThrow('Unsupported')
})

it('imports the legacy helper without a policy or funding fixture present', () => {
  const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'tpnil-lazy-header-'))
  try {
    const target = path.join(directory, 'controlled-header-fixture.ts')
    fs.copyFileSync(path.resolve(import.meta.dirname, '../src/wallet-lab/native/controlled-header-fixture.ts'), target)
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', `const m=await import(${JSON.stringify(pathToFileURL(target).href)});console.log(m.controlledHeaderFixture);try{m.getControlledHeaderFixture(m.controlledHeaderFixture);process.exitCode=1}catch(e){if(e.code!=='ENOENT')throw e}`], { encoding: 'utf8' })
    expect(child.status, child.stderr).toBe(0); expect(child.stdout.trim()).toBe(controlledHeaderFixture)
  } finally { fs.rmSync(directory, { recursive: true, force: true }) }
})

it('preserves the legacy baseline height0 failure and request order', async () => {
  const calls = cryptoBoundary(async args => { expect(args).toEqual({ height: 0 }); throw new Error('height0 rejected') })
  await expect(captureNativeSafeBoundary()).rejects.toThrow('height0 rejected')
  expect(calls.slice(-2)).toEqual(['getHeight', 'getHeaderForHeight'])
})

it('captures the positive baseline header with actual crypto roundtrips', async () => {
  const calls = cryptoBoundary(validHeader), result = await captureNativeSafeBoundary(selected)
  expect(result.headerRequest).toEqual({ height: 1 }); expect(result.header).toEqual({ header: selected.header })
  expect(result.signatureVerified).toBe(true); expect(result.hmacVerified).toBe(true)
  expect(Buffer.from(result.decrypted).toString()).toBe('TPNIL boundary fixture')
  expect(calls.slice(-2)).toEqual(['getHeight', 'getHeaderForHeight'])
})

it('retains a positive-header failure and lets the actual corpus score it', async () => {
  const error = Object.assign(new Error('Header backend failed'), { name: 'WERR_INTERNAL', code: 9 })
  cryptoBoundary(async () => { throw error })
  const baseline = await captureNativeSafeBoundary(selected)
  expect(baseline.headerError).toEqual({ name: 'WERR_INTERNAL', message: error.message, code: 9 })
  const report = await corpus(async () => { throw error })
  expect(report.assertions).toHaveLength(42)
  expect(report.assertions.find(row => row.id === controlledHeaderAssertion)?.result).toBe('FAIL')
  expect(report.trace.some(row => row.method === 'encrypt')).toBe(true)
  expect((await verifyBoundaryCorpus(report, null, controlledHeaderFixture)).outcome).toBe('FAIL')
})

it('changes only the prospective header ID and keeps42 assertions', async () => {
  const report = await corpus(validHeader), legacy = await corpus(validHeader, false)
  expect(report.assertions).toHaveLength(42); expect(legacy.assertions).toHaveLength(42)
  expect(report.assertions.map(row => row.id)).toEqual(legacy.assertions.map(row => row.id === 'getHeaderForHeight.genesis' ? controlledHeaderAssertion : row.id))
  expect(report.assertions.find(row => row.id === controlledHeaderAssertion)?.result).toBe('PASS')
  expect(legacy.assertions.find(row => row.id === 'getHeaderForHeight.genesis')?.result).toBe('FAIL')
  expect(legacy).not.toHaveProperty('headerFixture')
  expect((await verifyBoundaryCorpus(report, null, controlledHeaderFixture)).assertions).toHaveLength(42)
  expect((await verifyBoundaryCorpus(legacy, null)).assertions).toHaveLength(42)
})

it.each([
  ['wrong positive height', (r: any) => { r.trace.find((v: any) => v.method === 'getHeaderForHeight').args.height = 0 }],
  ['wrong returned header', (r: any) => { r.trace.find((v: any) => v.method === 'getHeaderForHeight').result.header = '00'.repeat(80) }],
  ['swapped positive and negative calls', (r: any) => { const ids = r.trace.flatMap((v: any, i: number) => v.method === 'getHeaderForHeight' ? [i] : []); [r.trace[ids[0]], r.trace[ids[1]]] = [r.trace[ids[1]], r.trace[ids[0]]] }],
  ['duplicate header observation', (r: any) => { r.trace.push(structuredClone(r.trace.find((v: any) => v.method === 'getHeaderForHeight'))) }],
  ['missing header observation', (r: any) => { r.trace.splice(r.trace.findIndex((v: any) => v.method === 'getHeaderForHeight'), 1) }],
  ['changed policy hash', (r: any) => { r.headerFixturePolicySha256 = '00'.repeat(32) }],
  ['changed funding hash', (r: any) => { r.headerFundingFixtureSha256 = '00'.repeat(32) }],
  ['downgraded selection', (r: any) => { delete r.headerFixture; delete r.headerFixturePolicySha256; delete r.headerFundingFixtureSha256 }],
  ['legacy predicate relabeling', (r: any) => { r.assertions.find((a: any) => a.id === controlledHeaderAssertion).id = 'getHeaderForHeight.genesis' }],
  ['result and error together', (r: any) => { r.trace.find((v: any) => v.method === 'getHeaderForHeight').error = { message: 'failed' } }]
] as const)('rejects %s', async (_name, mutate) => {
  const report = await corpus(validHeader); mutate(report)
  await expect(verifyBoundaryCorpus(report, null, controlledHeaderFixture)).rejects.toThrow()
})
