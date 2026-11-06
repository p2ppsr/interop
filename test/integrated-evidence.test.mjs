import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { digest, inventory, projection, verifyIntegrated } from '../scripts/integrated-evidence.mjs'

const root = path.resolve(import.meta.dirname, '..')
const profile = JSON.parse(fs.readFileSync(path.join(root, 'itcves/ITCVE-1/1.3.0/profile.json')))
function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tpnil-evidence-test-'))
  const write = (name, value) => fs.writeFileSync(path.join(directory, name), JSON.stringify(value))
  const inputs = ['itcves/ITCVE-1/1.3.0/profile.json', ...profile.componentProfiles, ...profile.dependencies]
  write('run-lock.json', { schema: 'tpnil-integrated-run-lock@1', source: '1'.repeat(40), dirty: false, profile,
    files: Object.fromEntries(inputs.map(file => [file, digest(fs.readFileSync(path.join(root, file)))])) })
  const lanes = profile.lanes.map(id => ({ id, runs: Array.from({ length: id === 'storage-sync' ? 1 : 2 }, (_, index) => {
    const report = id === 'storage-sync' ? {
      runs: Array.from({ length: 8 }, () => ({ assertions: [{ id: 'fixture', result: 'PASS' }], cleanup: true })),
      repeatability: Array.from({ length: 4 }, () => ({ matches: true }))
    } : { assertions: [{ id: 'fixture', result: 'PASS' }], cleanup: { closed: true } }
    const result = `${id}-${index}.json`; write(result, report)
    return { result, exitCode: 0, timedOut: false, assertions: projection(report) }
  }) }))
  write('result.json', { schema: 'tpnil-integrated-result@1', profile: 'ITCVE-1@1.3.0', lanes })
  const rebind = () => write('manifest.json', { schema: 'tpnil-integrated-manifest@1', files: inventory(directory) })
  const edit = (name, mutate) => { const data = JSON.parse(fs.readFileSync(path.join(directory, name))); mutate(data); write(name, data) }
  rebind()
  return { directory, edit, rebind, cleanup: () => fs.rmSync(directory, { recursive: true, force: true }) }
}

test('aggregate rejects omitted lanes, rewritten profile, cleanup failures and altered receipts even with rebound hashes', () => {
  const mutations = [
    f => f.edit('result.json', x => x.lanes.pop()),
    f => { f.edit('result.json', x => x.lanes.pop()); f.edit('run-lock.json', x => x.profile.lanes.pop()) },
    f => f.edit('run-lock.json', x => x.files['synthesis/package-lock.json'] = '0'.repeat(64)),
    f => f.edit('transport-go-0.json', x => x.cleanup.closed = false),
    f => f.edit('transport-go-0.json', x => x.cleanup = {}),
    f => f.edit('transport-go-0.json', x => x.assertions[0].result = 'FAIL'),
    f => f.edit('result.json', x => x.lanes[1].runs[0].timedOut = true),
    f => f.edit('storage-sync-0.json', x => x.repeatability[0].matches = false)
  ]
  for (const mutate of mutations) {
    const f = fixture()
    try { assert.equal(verifyIntegrated(f.directory).verified, true); mutate(f); f.rebind(); assert.throws(() => verifyIntegrated(f.directory)) }
    finally { f.cleanup() }
  }
})

test('aggregate detects modified files before trusting retained observations', () => {
  const f = fixture()
  try { f.edit('transport-go-0.json', x => x.assertions[0].result = 'FAIL'); assert.throws(() => verifyIntegrated(f.directory), /Evidence content/) }
  finally { f.cleanup() }
})
