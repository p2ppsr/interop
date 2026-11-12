import { expect, it } from 'vitest'
import { verifyNativeActionReferenceBinding } from '../src/wallet-lab/native/verify.js'

const identity = `02${'11'.repeat(32)}`
const row = { txid: 'ab'.repeat(32), reference: Buffer.from('wallet reference').toString('base64') }
const observation = () => ({ identity, actionReferences: [{ ...row }] })
const snapshot = () => ({ identity, references: [{ ...row }, { txid: 'cd'.repeat(32), reference: Buffer.from('later reference').toString('base64') }] })

it('binds the earlier conditional snapshot to the final wallet-scoped storage ledger', () => {
  expect(() => verifyNativeActionReferenceBinding(observation(), snapshot(), identity)).not.toThrow()
})

it.each([
  ['another wallet', (c: any, f: any) => { c.identity = f.identity = `03${'22'.repeat(32)}` }],
  ['missing final action', (_c: any, f: any) => { f.references.shift() }],
  ['substituted reference', (c: any) => { c.actionReferences[0].reference = Buffer.from('other').toString('base64') }],
  ['duplicate final identity', (_c: any, f: any) => { f.references.push({ ...row }) }],
  ['duplicate conditional identity', (c: any) => { c.actionReferences.push({ ...row }) }],
  ['missing reference on both sides', (c: any, f: any) => { delete c.actionReferences[0].reference; delete f.references[0].reference }],
  ['noncanonical base64', (c: any, f: any) => { c.actionReferences[0].reference = f.references[0].reference = 'AQ\nI=' }],
  ['unbound extra field', (c: any) => { c.actionReferences[0].owner = identity }],
  ['invalid txid', (c: any, f: any) => { c.actionReferences[0].txid = f.references[0].txid = 'other' }]
] as const)('rejects %s', (_label, mutate) => {
  const c = observation(), f = snapshot(); mutate(c, f)
  expect(() => verifyNativeActionReferenceBinding(c, f, identity)).toThrow()
})
