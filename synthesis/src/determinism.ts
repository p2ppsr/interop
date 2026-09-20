import { createHash } from 'node:crypto'

const encoder = new TextEncoder()

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value))
}

function normalize(value: unknown): unknown {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || Object.is(value, -0))
      throw new TypeError('Canonical fixture numbers must be safe integers')
    return value
  }
  if (Array.isArray(value)) return value.map(normalize)
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map(key => [key, normalize(record[key])])
    )
  }
  throw new TypeError(`Unsupported canonical fixture value: ${typeof value}`)
}

export function sha256Hex(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex')
}

export class DeterministicBytes {
  private counter = 0

  constructor(private readonly seed: string) {
    if (seed.length === 0) throw new TypeError('A deterministic seed is required')
  }

  take(length: number): Uint8Array {
    if (!Number.isSafeInteger(length) || length < 0) throw new TypeError('Invalid byte length')
    const chunks: Uint8Array[] = []
    let remaining = length
    while (remaining > 0) {
      const digest = createHash('sha256')
        .update(encoder.encode(this.seed))
        .update(encoder.encode(`:${this.counter++}`))
        .digest()
      const chunk = digest.subarray(0, Math.min(remaining, digest.length))
      chunks.push(chunk)
      remaining -= chunk.length
    }
    const result = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) {
      result.set(chunk, offset)
      offset += chunk.length
    }
    return result
  }
}

export class DeterministicClock {
  private value: bigint

  constructor(start: bigint) {
    this.value = start
  }

  now = (): bigint => this.value

  advance(seconds: bigint): bigint {
    if (seconds < 0n) throw new TypeError('The deterministic clock cannot move backwards')
    this.value += seconds
    return this.value
  }
}

export function utf8(value: string): Uint8Array {
  return encoder.encode(value)
}

export function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}
