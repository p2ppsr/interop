import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { verifyRust } from './verify-rust.mjs'
const root = path.resolve(import.meta.dirname, '..')
const source = path.resolve(process.argv[2]), inputs = process.argv.slice(3).map(file => path.resolve(file))
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
assert.equal(verifyRust(source, inputs).verified, true)
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'tpnil-rust-verifier-'))
let rejected = 0
try {
  for (const scenario of ['verdict', 'aggregate', 'omitted-assertion', 'omitted-call', 'rebound-input']) {
    const directory = path.join(temporary, scenario); fs.cpSync(source, directory, { recursive: true })
    const report = JSON.parse(fs.readFileSync(path.join(directory, 'result.json')))
    if (scenario === 'verdict') report.assertions[0].result = report.assertions[0].result === 'PASS' ? 'FAIL' : 'PASS'
    if (scenario === 'aggregate') report.outcome = report.outcome === 'PASS' ? 'FAIL' : 'PASS'
    if (scenario === 'omitted-assertion') report.assertions.pop()
    if (scenario === 'omitted-call') {
      const filename = path.join(directory, 'calls.json'), calls = JSON.parse(fs.readFileSync(filename)); calls.pop()
      const bytes = JSON.stringify(calls); fs.writeFileSync(filename, bytes)
      report.evidence.find(item => item.path === 'calls.json').sha256 = digest(bytes)
      report.assertions.pop()
    }
    if (scenario === 'rebound-input') {
      assert(report.inputs.length > 0, 'Mutation test needs a joined parent input')
      const entry = report.inputs[0], bytes = Buffer.from('{}\n'); fs.writeFileSync(path.join(directory, entry.path), bytes)
      entry.sha256 = digest(bytes); report.evidence.find(item => item.path === entry.path).sha256 = entry.sha256
    }
    fs.writeFileSync(path.join(directory, 'result.json'), JSON.stringify(report))
    assert.throws(() => verifyRust(directory, inputs), `Accepted forged ${scenario}`); rejected++
  }
  // A reproducible negative observation is valid evidence, even when the SUT
  // result is FAIL. Its retained expected outcome must not be rewritten PASS.
  const certificateInput = inputs.find(file => /^tpnil-rust-certificate-vectors@/.test(JSON.parse(fs.readFileSync(file)).schema ?? ''))
  assert(certificateInput, 'Mutation test needs the actual certificate corpus')
  const failureInput = path.join(temporary, 'known-failing-certificate.json'), failure = JSON.parse(fs.readFileSync(certificateInput))
  failure.cases.find(item => item.request.op === 'signature' && item.expected.valid === true).request.message += '00'
  fs.writeFileSync(failureInput, JSON.stringify(failure))
  const failureOutput = path.join(temporary, 'valid-failure')
  const run = spawnSync(process.execPath, [path.join(root, 'scripts/run-rust.mjs'), failureOutput, failureInput], { encoding: 'utf8', timeout: 300_000 })
  assert.equal(run.status, 0, run.stderr)
  assert.equal(verifyRust(failureOutput, [failureInput]).outcome, 'FAIL')
  console.log(JSON.stringify({ verified: true, mutationsRejected: rejected, validFailurePreserved: true }))
} finally { fs.rmSync(temporary, { recursive: true, force: true }) }
