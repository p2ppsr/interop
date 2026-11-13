import assert from 'node:assert/strict'
import { canonicalJson } from '../../determinism.js'
import { redactEvidence, type EvidenceBundle } from '../evidence.js'

export const coverageObservationEncoding = 'tpnil-coverage-observation@1.0.0' as const
export type CoverageObservationEncoding = typeof coverageObservationEncoding
// Measured pagination fixture: 3,012,329 nodes in 54,828,932 JSON bytes.
// This explicit per-report bound leaves room for the admitted native fixtures.
export const coverageObservationBounds = { nodes: 8_000_000, depth: 128, arrayLength: 8_000_000 } as const
type Path = Array<string | number>
type ErrorShape = { type: string; properties: Array<{ name: string; enumerable: boolean; configurable: boolean; writable?: boolean; nativeStack?: true }> }
type ExceptionalValue = { path: Path; kind: 'undefined' | 'hole' | 'number' | 'error'; data?: string | ErrorShape }
type Envelope = { schema: CoverageObservationEncoding; value: unknown; exceptionalValues: ExceptionalValue[] }
const own = (value: object, key: PropertyKey) => Object.prototype.hasOwnProperty.call(value, key)
const set = (value: object, key: PropertyKey, item: unknown) => Object.defineProperty(value, key, { value: item, enumerable: true, configurable: true, writable: true })
const redacted = (key: string) => (redactEvidence({ [key]: true }) as Record<string, unknown>)[key] === '[REDACTED]'
const numberHex = (value: number) => { const bytes = Buffer.alloc(8); bytes.writeDoubleBE(value); return bytes.toString('hex') }
const errorTypes = { Error, EvalError, RangeError, ReferenceError, SyntaxError, TypeError, URIError, AggregateError }
const nativeStack = Object.getOwnPropertyDescriptor(new Error(), 'stack')!

/** Reversible observation of the plain records/arrays crossing CWI. Unsupported
 * JS values fail explicitly; nothing converts malformed bytes into valid bytes.
 * Existing evidence redaction applies before any exceptional value is recorded. */
export function encodeCoverageObservation(value: unknown): Envelope {
  const exceptionalValues: ExceptionalValue[] = [], ancestors = new Set<object>()
  let nodes = 0
  const walk = (item: unknown, path: Path): unknown => {
    assert.ok(++nodes <= coverageObservationBounds.nodes && path.length <= coverageObservationBounds.depth, 'Coverage observation exceeds structural bounds')
    if (item === undefined) { exceptionalValues.push({ path, kind: 'undefined' }); return null }
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return item
    if (typeof item === 'number') {
      if (Number.isSafeInteger(item) && !Object.is(item, -0)) return item
      exceptionalValues.push({ path, kind: 'number', data: numberHex(item) }); return null
    }
    assert.ok(typeof item === 'object', 'Unsupported coverage observation value')
    assert.ok(!ancestors.has(item), 'Cyclic coverage observation'); ancestors.add(item)
    try {
      if (item instanceof Error) {
        const type = Object.entries(errorTypes).find(([, constructor]) => Object.getPrototypeOf(item) === constructor.prototype)?.[0]
        assert.ok(type, 'Unsupported custom Error prototype'); assert.equal(Object.getOwnPropertySymbols(item).length, 0)
        const properties = Object.getOwnPropertyNames(item).sort().map(name => {
          const descriptor = Object.getOwnPropertyDescriptor(item, name)!
          const flags = { name, enumerable: !!descriptor.enumerable, configurable: !!descriptor.configurable }
          if (own(descriptor, 'value')) return { ...flags, writable: !!descriptor.writable }
          assert.ok(name === 'stack' && typeof nativeStack.get === 'function' && descriptor.get === nativeStack.get && descriptor.set === nativeStack.set, 'Custom Error accessors are unsupported')
          return { ...flags, nativeStack: true as const }
        })
        exceptionalValues.push({ path, kind: 'error', data: { type, properties } })
        const result: Record<string, unknown> = {}
        for (const property of properties) set(result, property.name, redacted(property.name) ? '[REDACTED]' : walk((item as any)[property.name], [...path, property.name]))
        return result
      }
      if (Array.isArray(item)) {
        assert.ok(item.length <= coverageObservationBounds.arrayLength, 'Coverage array exceeds bounds')
        assert.equal(Object.getOwnPropertySymbols(item).length, 0, 'Symbol properties are not CWI arrays')
        for (const key of Object.getOwnPropertyNames(item)) {
          if (key === 'length') continue
          assert.ok(/^(0|[1-9][0-9]*)$/.test(key) && Number(key) < item.length, 'Coverage arrays must not have extra properties')
          const descriptor: PropertyDescriptor = Object.getOwnPropertyDescriptor(item, key)!
          assert.ok(own(descriptor, 'value'), 'Coverage observation must not invoke array accessors')
          assert.equal(descriptor.enumerable, true, 'Nonenumerable array entries are not CWI arrays')
        }
        return Array.from({ length: item.length }, (_unused, index) => {
          if (!own(item, index)) { exceptionalValues.push({ path: [...path, index], kind: 'hole' }); return null }
          return walk(Object.getOwnPropertyDescriptor(item, index)!.value, [...path, index])
        })
      }
      assert.ok(Object.getPrototypeOf(item) === Object.prototype || Object.getPrototypeOf(item) === null, `Coverage observation requires plain records at ${JSON.stringify(path)} (${Object.getPrototypeOf(item)?.constructor?.name})`)
      assert.equal(Object.getOwnPropertySymbols(item).length, 0, 'Symbol properties are not CWI records')
      const result: Record<string, unknown> = {}
      for (const key of Object.keys(item).sort()) {
        const descriptor = Object.getOwnPropertyDescriptor(item, key)!
        assert.ok(own(descriptor, 'value'), 'Coverage observation must not invoke accessors')
        set(result, key, redacted(key) ? '[REDACTED]' : walk(descriptor.value, [...path, key]))
      }
      return result
    } finally { ancestors.delete(item) }
  }
  return { schema: coverageObservationEncoding, value: walk(value, []), exceptionalValues }
}

/** The explicit profile controls decoding. An unselected envelope cannot be
 * interpreted as a legacy report; a selected profile cannot omit the envelope. */
export function decodeCoverageObservation<T = unknown>(value: unknown, encoding?: CoverageObservationEncoding): T {
  if (encoding === undefined) {
    assert.notEqual((value as any)?.schema, coverageObservationEncoding, 'Observation encoding requires an explicit profile')
    return value as T
  }
  assert.equal(encoding, coverageObservationEncoding)
  const envelope = value as Envelope
  assert.deepEqual(Object.keys(envelope).sort(), ['exceptionalValues', 'schema', 'value'])
  assert.equal(envelope.schema, coverageObservationEncoding)
  assert.ok(Array.isArray(envelope.exceptionalValues) && envelope.exceptionalValues.length <= coverageObservationBounds.nodes)
  // Reject a noncanonical input projection before restoring any JS-only values.
  canonicalJson(envelope)
  let result: any = structuredClone(envelope.value)
  const seen = new Set<string>()
  for (const entry of envelope.exceptionalValues) {
    assert.deepEqual(Object.keys(entry).sort(), ['number', 'error'].includes(entry.kind) ? ['data', 'kind', 'path'] : ['kind', 'path'])
    assert.ok(Array.isArray(entry.path) && entry.path.length <= 128)
    const identity = canonicalJson(entry.path); assert.ok(!seen.has(identity), 'Repeated exceptional path'); seen.add(identity)
    let parent: any, target = result, key: string | number | undefined
    for (const segment of entry.path) {
      assert.ok(target !== null && typeof target === 'object', 'Exceptional path crosses a scalar')
      if (Array.isArray(target)) assert.ok(Number.isSafeInteger(segment) && Number(segment) >= 0 && Number(segment) < target.length, 'Invalid array path')
      else assert.equal(typeof segment, 'string', 'Invalid record path')
      assert.ok(own(target, segment), 'Exceptional path is absent')
      parent = target; key = segment; target = target[segment]
    }
    if (entry.kind !== 'error') assert.equal(target, null, 'Exceptional path must bind its exact null placeholder')
    let restored: unknown
    if (entry.kind === 'undefined') restored = undefined
    else if (entry.kind === 'number') {
      assert.equal(typeof entry.data, 'string'); assert.match(entry.data as string, /^[0-9a-f]{16}$/); restored = Buffer.from(entry.data as string, 'hex').readDoubleBE()
      assert.ok(!Number.isSafeInteger(restored) || Object.is(restored, -0), 'Canonical number must not use a sidecar')
      assert.equal(numberHex(restored as number), entry.data)
    } else if (entry.kind === 'error') {
      assert.ok(target !== null && !Array.isArray(target) && typeof target === 'object')
      const shape = entry.data as ErrorShape
      assert.deepEqual(Object.keys(shape).sort(), ['properties', 'type']); assert.ok(own(errorTypes, shape.type)); assert.ok(Array.isArray(shape.properties))
      assert.deepEqual(shape.properties.map(row => row.name), Object.keys(target).sort(), 'Error property descriptors differ')
      const constructor = errorTypes[shape.type as keyof typeof errorTypes]
      const error: any = constructor === AggregateError ? new AggregateError([]) : new (constructor as ErrorConstructor)()
      for (const name of Object.getOwnPropertyNames(error)) delete error[name]
      for (const property of shape.properties) {
        assert.deepEqual(Object.keys(property).sort(), property.nativeStack === true ? ['configurable', 'enumerable', 'name', 'nativeStack'] : ['configurable', 'enumerable', 'name', 'writable'])
        for (const flag of ['enumerable', 'configurable'] as const) assert.equal(typeof property[flag], 'boolean')
        if (property.nativeStack === true) assert.ok(property.name === 'stack' && typeof nativeStack.get === 'function' && typeof nativeStack.set === 'function')
        else assert.equal(typeof property.writable, 'boolean')
        // Restore values first; descriptor attributes are applied after nested
        // undefined/error entries, so readonly cause properties remain exact.
        set(error, property.name, target[property.name])
      }
      restored = error
    } else {
      assert.equal(entry.kind, 'hole'); assert.ok(Array.isArray(parent) && typeof key === 'number', 'A hole must name an array entry')
      delete parent[key]; continue
    }
    if (key === undefined) result = restored; else set(parent, key, restored)
  }
  for (const entry of [...envelope.exceptionalValues].reverse()) if (entry.kind === 'error') {
    const error = entry.path.reduce<any>((parent, key) => parent[key], result)
    for (const property of (entry.data as ErrorShape).properties) {
      const value = error[property.name]
      if (property.nativeStack === true) {
        Object.defineProperty(error, property.name, { get: nativeStack.get, set: nativeStack.set, enumerable: property.enumerable, configurable: property.configurable })
        nativeStack.set!.call(error, value)
      } else Object.defineProperty(error, property.name, { value, enumerable: property.enumerable, configurable: property.configurable, writable: property.writable })
    }
  }
  assert.equal(canonicalJson(encodeCoverageObservation(result)), canonicalJson(envelope), 'Noncanonical, omitted or conflicting observation metadata')
  return result as T
}

export function writeCoverageObservation(evidence: Pick<EvidenceBundle, 'addJson'>, name: string, report: unknown, encoding?: CoverageObservationEncoding): void {
  if (encoding === undefined) { evidence.addJson(name, report); return }
  assert.equal(encoding, coverageObservationEncoding)
  evidence.addJson(name, encodeCoverageObservation(report))
}
