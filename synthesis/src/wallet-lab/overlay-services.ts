import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  OverlayAdminTokenTemplate,
  PrivateKey,
  ProtoWallet,
  PushDrop,
  Transaction,
  Utils,
  type WalletInterface
} from '@bsv/sdk'

export interface UmpRecord {
  txid: string
  outputIndex: number
  outpoint: string
  presentationHash: string
  recoveryHash: string
  beef: number[]
}

export interface OverlayObservation {
  sequence: number
  operation: 'lookup' | 'submit'
  service?: string
  topics?: string[]
  resultCount?: number
  txid?: string
  admittedOutputs?: number[]
}

interface Advertisement {
  beef: number[]
  outputIndex: number
  txid: string
}

const overlayOrigin = 'https://overlay.itcve.test'

function outputList(outputs: Advertisement[] | UmpRecord[]): Record<string, unknown> {
  return {
    type: 'output-list',
    outputs: outputs.map(output => ({
      beef: output.beef,
      outputIndex: output.outputIndex,
      txid: output.txid
    }))
  }
}

async function bodyBytes(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  const body = Buffer.from(JSON.stringify(value))
  response.writeHead(status, {
    'access-control-allow-origin': '*',
    'content-length': String(body.length),
    'content-type': 'application/json'
  }).end(body)
}

function validV3(fields: number[][]): boolean {
  const index = fields.length >= 12 && fields[11]?.length === 1
    ? 11
    : fields.length >= 13 && fields[12]?.length === 1
      ? 12
      : undefined
  if (index === undefined) return true
  if (fields[index]?.[0] !== 3) return false
  const algorithm = Utils.toUTF8(fields[index + 1] ?? [])
  if (algorithm !== 'argon2id' && algorithm !== 'pbkdf2-sha512') return false
  try {
    const parameters = JSON.parse(Utils.toUTF8(fields[index + 2] ?? [])) as { iterations?: unknown }
    return typeof parameters.iterations === 'number' && parameters.iterations > 0
  } catch {
    return false
  }
}

/**
 * A resettable, in-memory implementation of the public SLAP, SHIP and UMP HTTP
 * boundaries used by an unchanged mainnet wallet. It mirrors the canonical
 * UMP field predicates and retains the exact BEEF submitted by the SUT.
 */
export class ControlledOverlayServices {
  readonly records: UmpRecord[] = []
  readonly observations: OverlayObservation[] = []
  private readonly advertisements = new Map<string, Advertisement>()
  private sequence = 0

  async initialize(): Promise<void> {
    const wallet = new ProtoWallet(PrivateKey.fromHex('33'.repeat(32)))
    const template = new OverlayAdminTokenTemplate(wallet as unknown as WalletInterface)
    for (const [protocol, name] of [
      ['SLAP', 'ls_users'],
      ['SLAP', 'ls_ship'],
      ['SHIP', 'tm_users']
    ] as const) {
      const lockingScript = await template.lock(protocol, overlayOrigin, name)
      const transaction = new Transaction(1, [], [{ satoshis: 1, lockingScript }], 0)
      const txid = transaction.id('hex')
      this.advertisements.set(`${protocol}:${name}`, {
        beef: transaction.toAtomicBEEF(true),
        outputIndex: 0,
        txid
      })
    }
  }

  async handle(request: IncomingMessage, response: ServerResponse, pathname: string): Promise<void> {
    if (request.method === 'POST' && pathname === '/lookup') {
      await this.lookup(request, response)
      return
    }
    if (request.method === 'POST' && pathname === '/submit') {
      await this.submit(request, response)
      return
    }
    sendJson(response, 404, { error: 'controlled overlay route is not implemented', path: pathname })
  }

  private async lookup(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const question = JSON.parse((await bodyBytes(request)).toString('utf8')) as {
        service?: string
        query?: Record<string, unknown>
      }
      let outputs: Advertisement[] | UmpRecord[] = []
      if (question.service === 'ls_slap' && typeof question.query?.service === 'string') {
        const advertisement = this.advertisements.get(`SLAP:${question.query.service}`)
        if (advertisement !== undefined) outputs = [advertisement]
      } else if (question.service === 'ls_ship' && Array.isArray(question.query?.topics)) {
        if (question.query.topics.includes('tm_users')) {
          const advertisement = this.advertisements.get('SHIP:tm_users')
          if (advertisement !== undefined) outputs = [advertisement]
        }
      } else if (question.service === 'ls_users') {
        const query = question.query ?? {}
        outputs = this.records.filter(record =>
          (typeof query.presentationHash === 'string' && record.presentationHash === query.presentationHash.toLowerCase()) ||
          (typeof query.recoveryHash === 'string' && record.recoveryHash === query.recoveryHash.toLowerCase()) ||
          (typeof query.outpoint === 'string' && record.outpoint === query.outpoint)
        )
      }
      this.observations.push({
        sequence: ++this.sequence,
        operation: 'lookup',
        service: question.service,
        resultCount: outputs.length
      })
      sendJson(response, 200, outputList(outputs))
    } catch (error) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) })
    }
  }

  private async submit(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const topics = String(request.headers['x-topics'] ?? '').split(',').map(value => value.trim()).filter(Boolean)
    if (!topics.includes('tm_users')) {
      sendJson(response, 400, { error: 'tm_users is required' })
      return
    }
    try {
      const beef = [...await bodyBytes(request)]
      const transaction = Transaction.fromBEEF(beef)
      const txid = transaction.id('hex')
      const admittedOutputs: number[] = []
      for (const [outputIndex, output] of transaction.outputs.entries()) {
        try {
          const fields = PushDrop.decode(output.lockingScript).fields
          if (fields.length < 11 || fields[6]?.length !== 32 || fields[7]?.length !== 32 || !validV3(fields)) continue
          const presentationHash = Utils.toHex(fields[6]).toLowerCase()
          const recoveryHash = Utils.toHex(fields[7]).toLowerCase()
          if (this.records.some(record =>
            record.presentationHash === presentationHash || record.recoveryHash === recoveryHash
          )) continue
          const record: UmpRecord = {
            txid,
            outputIndex,
            outpoint: `${txid}.${outputIndex}`,
            presentationHash,
            recoveryHash,
            beef
          }
          this.records.push(record)
          admittedOutputs.push(outputIndex)
        } catch {
          // Non-UMP outputs are outside tm_users and are intentionally ignored.
        }
      }
      this.observations.push({
        sequence: ++this.sequence,
        operation: 'submit',
        topics,
        txid,
        admittedOutputs
      })
      if (admittedOutputs.length === 0) {
        sendJson(response, 422, { error: 'transaction has no admissible UMP output' })
        return
      }
      sendJson(response, 200, {
        tm_users: { outputsToAdmit: admittedOutputs, coinsToRetain: [], coinsRemoved: [] }
      })
    } catch (error) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) })
    }
  }
}

export const controlledOverlayOrigin = overlayOrigin
