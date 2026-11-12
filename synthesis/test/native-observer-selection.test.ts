import fs from 'node:fs'
import path from 'node:path'
import { expect, it } from 'vitest'
import { verifyNativeControlledHeaderEvidence } from '../src/wallet-lab/native/verify.js'
import { controlledHeaderFixture, getControlledHeaderFixture } from '../src/wallet-lab/native/controlled-header-fixture.js'

const root = path.resolve(import.meta.dirname, '../..')
const plan = JSON.parse(fs.readFileSync(path.join(root, 'infra/native/conformance/plan-pr368-cb3c2f2-observer-3.json'), 'utf8'))
const fixture = getControlledHeaderFixture(controlledHeaderFixture)
const metadata = { headerFixture: fixture.id, headerFixturePolicySha256: fixture.policySha256, headerFundingFixtureSha256: fixture.fixtureSha256 }
const inventory = () => ({ ...metadata, safeBoundary: { headerRequest: { height: fixture.height }, header: { header: fixture.header } } })

it('binds both public header observations to the parent plan without promoting recorded errors', () => {
  expect(() => verifyNativeControlledHeaderEvidence(plan, metadata, inventory())).not.toThrow()
  const failed: any = inventory()
  delete failed.safeBoundary.header
  failed.safeBoundary.headerError = { name: 'WERR_INTERNAL', message: 'Retained backend failure' }
  expect(() => verifyNativeControlledHeaderEvidence(plan, metadata, failed)).not.toThrow()
})

it.each([
  (p: any, b: any, i: any) => { delete p.headerFixture },
  (p: any, b: any, i: any) => { p.headerFixturePolicySha256 = '00'.repeat(32) },
  (p: any, b: any, i: any) => { delete b.headerFixture },
  (p: any, b: any, i: any) => { i.headerFundingFixtureSha256 = '00'.repeat(32) },
  (p: any, b: any, i: any) => { i.safeBoundary.headerRequest.height = 0 },
  (p: any, b: any, i: any) => { delete i.safeBoundary.header },
  (p: any, b: any, i: any) => { i.safeBoundary.headerError = { message: 'Conflicting result' } }
])('rejects a changed or downgraded parent fixture binding %#', mutate => {
  const p = structuredClone(plan), b = structuredClone(metadata), i = inventory()
  mutate(p, b, i)
  expect(() => verifyNativeControlledHeaderEvidence(p, b, i)).toThrow()
})
