// SPDX-License-Identifier: Apache-2.0
// LAB_SELF_TEST_ONLY prospective producer controls over failed native17 bytes.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { expect, it } from 'vitest'
import { canonicalPortabilityAssertions, portabilityAssertions } from '../src/wallet-lab/native/conformance-portability.js'
import { verifyNativePortability } from '../src/wallet-lab/native/verify-conformance-portability.js'
const archive = path.resolve(import.meta.dirname, '../../journals/integrated-native-attempts/2026-11-13/43384270997')
const originals = JSON.parse(execFileSync('python3', ['-c', `import io,json,sys,zipfile,hashlib,pathlib
p=pathlib.Path(sys.argv[1]);m=json.loads((p/'attempt.json').read_bytes());b=b''.join((p/n).read_bytes()for n in m['originalArchive']['parts']);assert 'sha256:'+hashlib.sha256(b).hexdigest()==m['originalArchive']['digest'];z=zipfile.ZipFile(io.BytesIO(b));print(json.dumps([json.loads(z.read(f'repetition-{n}/evidence/conformance/portability.json'))for n in [1,2]]))`, archive], { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 }))
const frozen = JSON.parse(fs.readFileSync(new URL('../../itcves/ITCVE-1/4.8.0/profile.json', import.meta.url), 'utf8')).nativeConformance.assertions['ISI-4-V007']
it.each([0, 1])('orders native17 repetition%i by the frozen score inventory while preserving every predicate and causal receipt', async index => {
  const original = originals[index], before = JSON.stringify(original), r = structuredClone(original)
  expect(r.assertions.map((a: any) => a.id)).not.toEqual(frozen)
  const observed = await verifyNativePortability(r); expect(observed.result).toBe('PASS')
  r.assertions = canonicalPortabilityAssertions(r.assertions)
  expect(r.assertions.map((a: any) => a.id)).toEqual(frozen)
  expect((await verifyNativePortability(r)).assertions.map(a => a.id)).toEqual(frozen)
  for (const row of r.assertions) expect(row).toEqual(original.assertions.find((a: any) => a.id === row.id))
  for (const key of Object.keys(original).filter(k => k !== 'assertions')) expect(r[key]).toEqual(original[key])
  expect(JSON.stringify(original)).toBe(before)
}, 30_000)
it.each(['missing', 'duplicate', 'unknown', 'extra'])('rejects %s score rows instead of dropping observations', kind => {
  const rows = structuredClone(originals[0].assertions)
  if (kind === 'missing') rows.pop()
  if (kind === 'duplicate') rows[0] = structuredClone(rows[1])
  if (kind === 'unknown') rows[0].id = 'portability.unobserved'
  if (kind === 'extra') rows.push({ id: 'portability.unobserved', result: 'PASS' })
  expect(() => canonicalPortabilityAssertions(rows)).toThrow()
})
it('preserves a failed predicate and never promotes it through ordering', async () => {
  const r = structuredClone(originals[0]), row = r.assertions.find((a: any) => a.id === 'portability.same-identity')
  row.result = 'FAIL'; row.detail = 'LAB_SELF_TEST_ONLY retained negative result'
  r.assertions = canonicalPortabilityAssertions(r.assertions)
  expect(r.assertions[0]).toEqual(row); expect(r.assertions.map((a: any) => a.id)).toEqual(portabilityAssertions)
  await expect(verifyNativePortability(r)).rejects.toThrow()
})
