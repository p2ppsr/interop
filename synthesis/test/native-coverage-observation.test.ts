import { expect, it } from 'vitest'
import assert from 'node:assert/strict'
import { canonicalJson } from '../src/determinism.js'
import { EvidenceBundle } from '../src/wallet-lab/evidence.js'
import { coverageObservationEncoding as encoding, decodeCoverageObservation as decode, encodeCoverageObservation as encode, writeCoverageObservation as write } from '../src/wallet-lab/native/coverage-observation.js'

it('retains optional undefined separately from absent, null, array undefined and holes', () => {
  const original = { absent: {}, optional: { value: undefined }, nullable: null, bytes: [1, undefined, , 4] }
  expect(() => canonicalJson(original)).toThrow('undefined')
  const retained = JSON.parse(canonicalJson(encode(original)))
  const restored = decode<typeof original>(retained, encoding)
  expect(restored).toStrictEqual(original)
  expect(Object.hasOwn(restored.optional, 'value')).toBe(true)
  expect(Object.hasOwn(restored.absent, 'value')).toBe(false)
  expect(Object.hasOwn(restored.bytes, 1)).toBe(true)
  expect(Object.hasOwn(restored.bytes, 2)).toBe(false)
})
it.each([NaN, Infinity, -Infinity, -0, 0.5, Number.MAX_SAFE_INTEGER + 1])('retains the exact invalid canonical number %s without converting it to null or an integer', value => {
  expect(() => canonicalJson({ bytes: [value] })).toThrow()
  const result = decode<{ bytes: number[] }>(JSON.parse(canonicalJson(encode({ bytes: [value] }))), encoding)
  expect(Object.is(result.bytes[0], value)).toBe(true)
  expect(Number.isSafeInteger(result.bytes[0]) && !Object.is(result.bytes[0], -0)).toBe(false)
})
it('keeps secret-key redaction ahead of the exceptional-value sidecar', () => {
  const retained = encode({ Password: undefined, authorization: 'secret', record: { privateKey: NaN }, ordinary: undefined })
  expect(canonicalJson(retained)).not.toContain('secret')
  expect(retained.exceptionalValues).toEqual([{ path: ['ordinary'], kind: 'undefined' }])
  expect(decode(retained, encoding)).toStrictEqual({ Password: '[REDACTED]', authorization: '[REDACTED]', record: { privateKey: '[REDACTED]' }, ordinary: undefined })
})
it('writes actual EvidenceBundle canonical bytes only with explicit selection', () => {
  const evidence = new EvidenceBundle('/unused-local-self-test'), original = { result: { optional: undefined } }
  expect(() => write(evidence, 'coverage.json', original)).toThrow('undefined')
  write(evidence, 'coverage.json', original, encoding)
  const retained = JSON.parse(evidence.readBytes('coverage.json').toString())
  expect(decode(retained, encoding)).toStrictEqual(original)
  expect(() => decode(retained)).toThrow('explicit profile')
  expect(() => decode(original, encoding)).toThrow()
  expect(() => write(evidence, 'coverage.json', original, 'unknown' as any)).toThrow()
})
it('cannot confuse ordinary sentinel-shaped objects or prototype keys with metadata', () => {
  const original = JSON.parse('{"__proto__":{"polluted":true},"constructor":{"prototype":{"test":1}},"kind":"undefined","path":[]}')
  assert.deepStrictEqual(decode(JSON.parse(canonicalJson(encode(original))), encoding), original)
  expect(({} as any).polluted).toBeUndefined()
})
const corruptions: Record<string, (value: any) => void> = {
  'wrong schema': v => { v.schema = 'unknown' },
  'unknown field': v => { v.extra = true },
  'repeated path': v => { v.exceptionalValues.push(v.exceptionalValues[0]) },
  'non-null target': v => { v.value.a = 1 },
  'missing target': v => { delete v.value.a },
  'out-of-bounds array': v => { v.exceptionalValues[0].path = ['b', 2] },
  'string array path': v => { v.exceptionalValues[0].path = ['b', '0'] },
  'numeric record path': v => { v.exceptionalValues[0].path = [0] },
  'hole on a record': v => { v.exceptionalValues[0].kind = 'hole' },
  'unknown kind': v => { v.exceptionalValues[0].kind = 'bogus' },
  'extra sidecar value': v => { v.exceptionalValues[0].data = 'unclaimed' },
  'canonical integer as exceptional': v => { v.exceptionalValues[0] = { path: ['a'], kind: 'number', data: '3ff0000000000000' } },
  'reordered paths': v => { v.exceptionalValues.reverse() },
  'parent scalar path': v => { v.exceptionalValues.push({ path: ['a', 'child'], kind: 'undefined' }) }
}
for (const [name, mutate] of Object.entries(corruptions)) it(`rejects ${name}`, () => {
  const value = encode({ a: undefined, b: [undefined] }); mutate(value)
  expect(() => decode(value, encoding)).toThrow()
})
it.each([new Date(), new Map(), new Uint8Array([1, 2]), 1n, Symbol('x'), () => 1])('rejects unsupported non-CWI types instead of coercing them into valid bytes or records', value => {
  expect(() => encode(value)).toThrow()
})
it('rejects cycles and accessors without invoking them', () => {
  const cyclic: any = {}; cyclic.child = cyclic
  expect(() => encode(cyclic)).toThrow('Cyclic')
  let called = false; const value = Object.defineProperty({}, 'secret', { enumerable: true, get() { called = true; return 1 } })
  expect(() => encode(value)).toThrow('accessors'); expect(called).toBe(false)
})
it('rejects array accessors before invoking a getter', () => {
  let called = false
  const value = Object.defineProperty([1], '0', { enumerable: true, get() { called = true; return undefined } })
  expect(() => encode(value)).toThrow('array accessors'); expect(called).toBe(false)
})
it.each(['symbol', 'hidden-extra', 'hidden-index'])('rejects unsupported %s array properties instead of dropping them', kind => {
  const value = [1]
  if (kind === 'symbol') Object.defineProperty(value, Symbol('extra'), { value: undefined })
  else Object.defineProperty(value, kind === 'hidden-index' ? '0' : 'extra', { value: undefined, enumerable: false })
  expect(() => encode(value)).toThrow()
})
it('retains native Error causes, stack values and readonly/nonenumerable undefined properties', () => {
  const error = new TypeError('outer', { cause: new Error('inner') })
  Object.defineProperty(error, 'optional', { value: undefined, enumerable: false, configurable: false, writable: false })
  const restored = decode<any>(JSON.parse(canonicalJson(encode({ error }))), encoding).error
  assert.deepStrictEqual(restored, error)
  expect(restored instanceof TypeError).toBe(true)
  expect(restored.cause instanceof Error).toBe(true)
  expect(restored.stack).toBe(error.stack)
  for (const key of Object.getOwnPropertyNames(error)) assert.deepStrictEqual(Object.getOwnPropertyDescriptor(restored, key), Object.getOwnPropertyDescriptor(error, key))
})
it('rejects custom Error getters without executing them', () => {
  let called = false; const value = new Error('cause')
  Object.defineProperty(value, 'stack', { get() { called = true; return 'invented' } })
  expect(() => encode(value)).toThrow('Custom Error accessors'); expect(called).toBe(false)
})
it('rejects forged Error class or property descriptor metadata', () => {
  const encoded = encode({ error: new Error('actual') })
  for (const mutate of [(x: any) => { x.exceptionalValues[0].data.type = 'Function' }, (x: any) => { x.exceptionalValues[0].data.properties.pop() }, (x: any) => { x.exceptionalValues[0].data.properties[0].extra = true }]) {
    const changed = structuredClone(encoded); mutate(changed); expect(() => decode(changed, encoding)).toThrow()
  }
})
