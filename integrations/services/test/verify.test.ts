import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { verifyServicesResult } from '../src/verify.js'

const retained = path.resolve(import.meta.dirname, '../../../journals/services-integration/2026-11-06/local-01')
async function mutated(run: (directory: string, result: any) => Promise<void>) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tpnil-service-mutation-'))
  try { await fs.cp(retained, directory, { recursive: true }); const result = JSON.parse(await fs.readFile(path.join(directory, 'result.json'), 'utf8')); await run(directory, result) }
  finally { await fs.rm(directory, { recursive: true, force: true }) }
}
test('retained real service evidence passes its independent semantic checks', async () => {
  assert.deepEqual(await verifyServicesResult(retained), { verified: true, result: 'PASS', assertions: 14 })
})
test('a forged passing lookup cannot substitute an already synchronized payload', async () => mutated(async (directory, result) => {
  const reverse = result.assertions.find((entry: any) => entry.id === 'OVERLAY-GO-002')
  reverse.actual.outputs[1] = reverse.actual.outputs[0]
  await fs.writeFile(path.join(directory, 'result.json'), JSON.stringify(result))
  await assert.rejects(verifyServicesResult(directory), /OVERLAY-GO-002/)
}))
test('altered header still fails after its evidence digest is rebound', async () => mutated(async (directory, result) => {
  const file = path.join(directory, 'fixtures.json'), fixture = JSON.parse(await fs.readFile(file, 'utf8'))
  fixture.headers[2].nonce += 1
  const bytes = JSON.stringify(fixture); await fs.writeFile(file, bytes)
  result.evidence.find((item: any) => item.file === 'fixtures.json').sha256 = createHash('sha256').update(bytes).digest('hex')
  await fs.writeFile(path.join(directory, 'result.json'), JSON.stringify(result))
  await assert.rejects(verifyServicesResult(directory))
}))
test('altered issuer signature still fails after its evidence digest is rebound', async () => mutated(async (directory, result) => {
  const file = path.join(directory, 'fixtures.json'), fixture = JSON.parse(await fs.readFile(file, 'utf8'))
  fixture.publicCertificate.signature = '3006020101020101'
  const bytes = JSON.stringify(fixture); await fs.writeFile(file, bytes)
  result.evidence.find((item: any) => item.file === 'fixtures.json').sha256 = createHash('sha256').update(bytes).digest('hex')
  await fs.writeFile(path.join(directory, 'result.json'), JSON.stringify(result))
  await assert.rejects(verifyServicesResult(directory))
}))
test('omitted source provenance cannot retain PASS', async () => mutated(async (directory, result) => {
  result.sources.files = []
  await fs.writeFile(path.join(directory, 'result.json'), JSON.stringify(result))
  await assert.rejects(verifyServicesResult(directory))
}))
test('incomplete cleanup cannot retain PASS', async () => mutated(async (directory, result) => {
  result.cleanup = result.cleanup.filter((item: any) => item.name !== 'mongo')
  await fs.writeFile(path.join(directory, 'result.json'), JSON.stringify(result))
  await assert.rejects(verifyServicesResult(directory))
}))
