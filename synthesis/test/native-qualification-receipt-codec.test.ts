// SPDX-License-Identifier: Apache-2.0
// LAB_SELF_TEST_ONLY: original native18 qualified; integrated receipt replay failed.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { expect, it } from 'vitest'
import { canonicalJson } from '../src/determinism.js'
import { decodeCoverageObservation, encodeCoverageObservation, coverageObservationEncoding } from '../src/wallet-lab/native/coverage-observation.js'
import { verifyNativeCoverageExtension } from '../src/wallet-lab/native/coverage-extension-verifier.js'
const archive = path.resolve(import.meta.dirname, '../../journals/integrated-native-attempts/2026-11-13/43396834995')
const originals = JSON.parse(execFileSync('python3', ['-c', `import io,json,sys,zipfile,hashlib,pathlib
p=pathlib.Path(sys.argv[1]);m=json.loads((p/'attempt.json').read_bytes());b=b''.join((p/n).read_bytes()for n in m['originalArchive']['parts']);assert 'sha256:'+hashlib.sha256(b).hexdigest()==m['originalArchive']['digest'];z=zipfile.ZipFile(io.BytesIO(b));print(json.dumps([json.loads(z.read('qualification.json')),*[json.loads(z.read(f'repetition-{n}/evidence/conformance/coverage-extension.json'))for n in [1,2]]]))`, archive], { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 }))
it.each([0, 1])('retains native18 repetition%i raw undefined values through strict qualification JSON replay', async index => {
  const report: any = decodeCoverageObservation(originals[index + 1], coverageObservationEncoding), before = canonicalJson(originals[index + 1])
  const checked = await verifyNativeCoverageExtension(report)
  expect(checked.verified).toBe(true); expect(checked.counts).toEqual({ PASS: 61, FAIL: 0, BLOCKED: 0 })
  const exceptional = report.trace.find((r: any) => r.id === 'fixture-external').result
  expect(Object.hasOwn(exceptional, 'noSendChange')).toBe(true); expect(exceptional.noSendChange).toBeUndefined()
  expect(() => canonicalJson(exceptional)).toThrow('undefined')
  for (const tx of checked.transactions) expect(decodeCoverageObservation(tx.originalResult, coverageObservationEncoding)).toEqual(report.trace.find((r: any) => r.id === tx.callId).result)
  const receipt = checked.transactions.find(t => t.callId === 'fixture-external')!
  expect(receipt.originalResult.exceptionalValues).toContainEqual({ path: ['noSendChange'], kind: 'undefined' })
  expect(canonicalJson(JSON.parse(JSON.stringify(checked)))).toBe(canonicalJson(checked))
  const qualification = structuredClone(originals[0]); expect(qualification.qualifiedEnvironment).toBe(true)
  qualification.repetitions[index].independent.coverageSuiteBindings.extension.returnedTransactions = checked.transactions
  expect(canonicalJson(JSON.parse(JSON.stringify(qualification)))).toBe(canonicalJson(qualification))
  expect(canonicalJson(originals[index + 1])).toBe(before)
}, 30_000)
it.each(['undefined-member', 'undefined-element', 'hole', 'nan', 'infinity', 'negative-zero'])('retains %s without turning it into an ordinary valid JSON value', kind => {
  const value: any = { tx: [1, 2, 3], noSendChange: [] }
  if (kind === 'undefined-member') value.noSendChange = undefined
  if (kind === 'undefined-element') value.tx[1] = undefined
  if (kind === 'hole') delete value.tx[1]
  if (kind === 'nan') value.tx[1] = NaN
  if (kind === 'infinity') value.tx[1] = Infinity
  if (kind === 'negative-zero') value.tx[1] = -0
  const encoded = encodeCoverageObservation(value), stored = JSON.parse(canonicalJson(encoded)), recovered: any = decodeCoverageObservation(stored, coverageObservationEncoding)
  expect(encoded.exceptionalValues).toHaveLength(1); expect(recovered).toEqual(value)
  expect(Object.hasOwn(recovered.tx, 1)).toBe(Object.hasOwn(value.tx, 1))
  expect(Object.is(recovered.tx[1], value.tx[1])).toBe(true)
})
