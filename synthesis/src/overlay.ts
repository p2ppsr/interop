import { LockingScript, Transaction, UnlockingScript } from '@bsv/sdk'
import { BOARD_TOPIC, decodeAndVerifyBoardToken, type BoardRecord } from './board.js'
import { canonicalJson, sha256Hex } from './determinism.js'

export interface OverlaySubmission {
  topic: string
  lockingScriptHex: string
  spends: string[]
}

export interface OverlayEvent {
  sequence: number
  topic: string
  txid: string
  outpoint: string
  spends: string[]
  lockingScriptHex: string
  record: BoardRecord
}

export interface SubmissionResult {
  accepted: true
  txid: string
  outpoint: string
  sequence: number
}

export class ReferenceBoardOverlay {
  private events: OverlayEvent[] = []
  private readonly current = new Map<string, OverlayEvent>()
  private readonly outpoints = new Map<string, OverlayEvent>()
  private readonly spent = new Set<string>()

  async submit(input: OverlaySubmission): Promise<SubmissionResult> {
    if (input.topic !== BOARD_TOPIC) throw new Error(`Unsupported overlay topic: ${input.topic}`)
    const record = await decodeAndVerifyBoardToken(input.lockingScriptHex)
    const existing = this.current.get(record.key)
    if (existing === undefined) {
      if (record.revision !== 1 || record.previous !== null || input.spends.length !== 0)
        throw new Error('A new board key must start at revision 1 without a spent token')
    } else {
      if (
        record.revision !== existing.record.revision + 1 ||
        record.previous !== existing.outpoint ||
        input.spends.length !== 1 ||
        input.spends[0] !== existing.outpoint
      )
        throw new Error('A board update must spend the current token and advance one revision')
      if (record.author !== existing.record.author) throw new Error('A board update changed author identity')
    }
    for (const outpoint of input.spends) {
      if (!this.outpoints.has(outpoint)) throw new Error(`Unknown spent outpoint: ${outpoint}`)
      if (this.spent.has(outpoint)) throw new Error(`Double spend: ${outpoint}`)
    }
    const transaction = new Transaction(
      1,
      input.spends.map(outpoint => {
        const [sourceTXID, sourceOutputIndex] = splitOutpoint(outpoint)
        return {
          sourceTXID,
          sourceOutputIndex,
          sequence: 0xffffffff,
          unlockingScript: new UnlockingScript([])
        }
      }),
      [{ satoshis: 1, lockingScript: LockingScript.fromHex(input.lockingScriptHex) }],
      0
    )
    const txid = transaction.id('hex')
    const outpoint = `${txid}:0`
    if (this.outpoints.has(outpoint)) throw new Error(`Duplicate transaction: ${txid}`)
    const event: OverlayEvent = {
      sequence: this.events.length + 1,
      topic: input.topic,
      txid,
      outpoint,
      spends: [...input.spends],
      lockingScriptHex: input.lockingScriptHex,
      record
    }
    this.events.push(event)
    this.outpoints.set(outpoint, event)
    for (const spent of input.spends) this.spent.add(spent)
    this.current.set(record.key, event)
    return { accepted: true, txid, outpoint, sequence: event.sequence }
  }

  lookup(key: string): OverlayEvent | undefined {
    return cloneEvent(this.current.get(key))
  }

  history(key: string): OverlayEvent[] {
    return this.events.filter(event => event.record.key === key).map(event => structuredClone(event))
  }

  journal(): OverlayEvent[] {
    return this.events.map(event => structuredClone(event))
  }

  stateDigest(): string {
    return sha256Hex(
      canonicalJson(
        [...this.current.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, event]) => ({ key, outpoint: event.outpoint, record: event.record }))
      )
    )
  }

  async synchronize(events: readonly OverlayEvent[]): Promise<void> {
    if (events.length < this.events.length) throw new Error('Remote journal is behind local state')
    for (let index = 0; index < this.events.length; index += 1) {
      if (canonicalJson(this.events[index]) !== canonicalJson(events[index]))
        throw new Error(`Overlay journal fork at sequence ${index + 1}`)
    }
    for (const event of events.slice(this.events.length)) {
      const result = await this.submit({
        topic: event.topic,
        lockingScriptHex: event.lockingScriptHex,
        spends: event.spends
      })
      if (result.txid !== event.txid || result.outpoint !== event.outpoint || result.sequence !== event.sequence)
        throw new Error(`Overlay synchronization diverged at sequence ${event.sequence}`)
    }
  }

  static async replay(events: readonly OverlayEvent[]): Promise<ReferenceBoardOverlay> {
    const overlay = new ReferenceBoardOverlay()
    for (const event of events) {
      const result = await overlay.submit({
        topic: event.topic,
        lockingScriptHex: event.lockingScriptHex,
        spends: event.spends
      })
      if (result.txid !== event.txid || result.outpoint !== event.outpoint || result.sequence !== event.sequence)
        throw new Error(`Overlay replay diverged at sequence ${event.sequence}`)
    }
    return overlay
  }
}

function splitOutpoint(value: string): [string, number] {
  const match = /^([0-9a-f]{64}):([0-9]+)$/u.exec(value)
  if (match?.[1] === undefined || match[2] === undefined) throw new TypeError(`Invalid outpoint: ${value}`)
  const index = Number(match[2])
  if (!Number.isSafeInteger(index)) throw new TypeError(`Invalid outpoint: ${value}`)
  return [match[1], index]
}

function cloneEvent(event: OverlayEvent | undefined): OverlayEvent | undefined {
  return event === undefined ? undefined : structuredClone(event)
}
