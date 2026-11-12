import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomBytes } from 'node:crypto'
import { Transaction, PushDrop, ProtoWallet, PrivateKey, type WalletInterface } from '@bsv/sdk'
import { createFixtureWallet } from '../../storage-sync/fixture-wallet.js'
import { toBase64Url, toHex, encodeDeterministicCbor } from '@bsv/lch'
import { BOARD_TOPIC, boardProtocol, encodeBoardToken, decodeAndVerifyBoardToken, type BoardFixtureVersion } from '../../board.js'
import { CHIRPContentStore, ReferenceCHIRPNetwork } from '../../content.js'
import { canonicalJson, sha256Hex } from '../../determinism.js'
import { ReferenceLCHClient } from '../../lch-reference/referenceClient.js'
import { ReferenceLCHServer } from '../../lch-reference/referenceServer.js'
import { encodeUHRPAdvertisement, decodeAndVerifyUHRPAdvertisement, UHRP_TOPIC, UHRP_LOOKUP } from '../../uhrp.js'
import { referenceImage } from '../../run.js'
import type { ControlledWalletServices } from '../services.js'
import { lchWalletBoundary } from './lch-wallet.js'

/**
 * API-driven synthesis through an unchanged native wallet. The content hosts and
 * LCH application are controlled laboratory roles; the wallet, storage, overlay,
 * ChainTracks, signatures, transactions and multilateral settlement are real.
 * This records public-wallet API behavior, not a browser application's usability.
 */
export async function runNativeSynthesis(wallet: WalletInterface, services: ControlledWalletServices, output: string, fixtureVersion: BoardFixtureVersion = 'legacy-v1'): Promise<Record<string, unknown>> {
  const protocol = boardProtocol(fixtureVersion)
  const decodeBoard = (script: string) => decodeAndVerifyBoardToken(script, fixtureVersion)
  const encodeBoard = (input: Parameters<typeof encodeBoardToken>[1]) => encodeBoardToken(wallet, input, fixtureVersion)
  const basket = (legacy: string) => fixtureVersion === 'validated-v2' ? legacy.replaceAll('-', ' ') : legacy
  await fs.mkdir(output, { recursive: true })
  if ((await fs.readdir(output)).length) throw new Error('Native synthesis evidence directory must be empty')
  const assertions: Record<string, unknown>[] = []
  const transactions: Array<{ role: string; txid: string; raw: string; beef: number[] }> = []
  const observations: unknown[] = []
  const packageRoot = path.resolve(import.meta.dirname, '../../../..', 'integrations/services')
  const { startOverlayNode, submit, lookup, syncPeer } = await import(pathToFileURL(path.join(packageRoot, 'src/overlay.ts')).href)
  const mongoUri = process.env.TPNIL_GO_MONGO_URI
  if (!mongoUri) throw new Error('The joined native synthesis profile requires its isolated Mongo replica set')
  const now = () => BigInt(Math.floor(Date.now() / 1000))
  const tracker = {
    currentHeight: async (): Promise<number> => { const r = await fetch(`${services.serviceUrl}/chaintracks/v2/height`, { signal: AbortSignal.timeout(15000) }); if (!r.ok) throw new Error('Header height unavailable'); const value = await r.json() as { height?: number; value?: { height: number } }; return (value.value ?? value).height! },
    findHeaderForHeight: async (height: number): Promise<any> => { const r = await fetch(`${services.serviceUrl}/chaintracks/v2/header/height/${height}`, { signal: AbortSignal.timeout(15000) }); if (!r.ok) return undefined; const value = await r.json() as any; return value.value ?? value },
    isValidRootForHeight: async (root: string, height: number): Promise<boolean> => (await tracker.findHeaderForHeight(height))?.merkleRoot === root
  }
  let overlay: any, replica: any
  const payees: any[] = []
  const cleanup: unknown[] = []
  const saveTransaction = async (role: string, tx: Transaction): Promise<void> => {
    if (!(await tx.verify(tracker))) throw new Error(`${role} does not verify against the controlled real header provider`)
    transactions.push({ role, txid: tx.id('hex'), raw: tx.toHex(), beef: tx.toAtomicBEEF() })
    await fs.writeFile(path.join(output, 'transactions.json'), JSON.stringify(transactions, null, 2) + '\n')
  }
  const finalized = (result: { tx?: number[] | Uint8Array; txid?: string }): Transaction => {
    if (!result.tx || !result.txid) throw new Error('Wallet did not return finalized Atomic BEEF and TXID')
    const tx = Transaction.fromAtomicBEEF(result.tx)
    if (tx.id('hex') !== result.txid) throw new Error('Wallet result TXID differs from returned transaction')
    return tx
  }
  const configure = (node: any) => {
    for (const [topic, name, decoder] of [[BOARD_TOPIC, 'ls_tpnil_synthesis_board', decodeBoard], [UHRP_TOPIC, UHRP_LOOKUP, decodeAndVerifyUHRPAdvertisement]] as const) {
      node.configureTopicManager(topic, {
        async identifyAdmissibleOutputs(beef: number[], previousCoins: number[]) {
          const tx = Transaction.fromBEEF(beef), admitted: number[] = []
          for (const [i, item] of tx.outputs.entries()) {
            try {
              const record: any = await decoder(item.lockingScript.toHex())
              if (topic === BOARD_TOPIC && record.previous !== null) {
                const [id, index] = record.previous.split(':')
                const input = tx.inputs.find(input => input.sourceTXID === id && input.sourceOutputIndex === Number(index))
                if (!input) continue
                // GASP admission runs before imported history is persisted. Its
                // BEEF carries the signed predecessor needed by this policy.
                let source = input.sourceTransaction
                if (!source) { const prior = await node.engine.storage.findOutput(id, Number(index), topic, undefined, true); if (prior?.beef) source = Transaction.fromBEEF(prior.beef) }
                if (!source) continue
                const previous = await decodeBoard(source.outputs[Number(index)]!.lockingScript.toHex())
                if (previous.key !== record.key || previous.revision + 1 !== record.revision || previous.author !== record.author) continue
              } else if (topic === BOARD_TOPIC && record.revision !== 1) continue
              admitted.push(i)
            } catch { /* Other application outputs are outside this topic. */ }
          }
          return { outputsToAdmit: admitted, coinsToRetain: topic === BOARD_TOPIC ? previousCoins : [] }
        },
        async identifyNeededInputs(beef: number[]) {
          if (topic !== BOARD_TOPIC) return []
          const needed = []
          for (const output of Transaction.fromBEEF(beef).outputs) try { const record = await decodeBoard(output.lockingScript.toHex()); if (record.previous) { const [txid, index] = record.previous.split(':'); needed.push({ txid, outputIndex: Number(index) }) } } catch {}
          return needed
        },
        async getDocumentation() { return 'TPNIL signed Board/UHRP application policy, bound to complete transactions.' },
        async getMetaData() { return { name: topic, shortDescription: 'Controlled synthesis topic' } }
      })
      node.configureLookupService(name, {
        admissionMode: 'locking-script', spendNotificationMode: 'none',
        async outputAdmittedByTopic() {}, async outputSpent() {}, async outputEvicted() {},
        async lookup(question: any) {
          const outputs = await node.engine.storage.findUTXOsForTopic(topic, undefined, 1000, true)
          const matches = []
          for (const entry of outputs) {
            const tx = Transaction.fromBEEF(entry.beef), record: any = await decoder(tx.outputs[entry.outputIndex]!.lockingScript.toHex())
            if ((topic === BOARD_TOPIC && record.key === question.query.key) || (topic === UHRP_TOPIC && record.uhrpUrl === question.query.uhrpUrl.replace(/^chirp:/, 'uhrp:') && record.expiryTime > Number(now()))) matches.push({ txid: entry.txid, outputIndex: entry.outputIndex })
          }
          return matches
        },
        async getDocumentation() { return 'Current live signed synthesis outputs.' }, async getMetaData() { return { name, shortDescription: 'Controlled synthesis lookup' } }
      })
    }
  }
  try {
    for (const key of ['61', '62']) {
      const payee = await createFixtureWallet(services, key.repeat(32))
      payees.push(new Proxy(payee, { get(target, name) { const value = Reflect.get(target, name); if (typeof value !== 'function') return value; return async (...args: unknown[]) => { try { return await value.apply(target, args) } catch (error) { observations.push({ payeeMethod: String(name), error: error instanceof Error ? error.message : String(error) }); throw error } } } }))
    }
    const prefix = `tpnil_native_${randomBytes(5).toString('hex')}`
    const nodeOptions = { mongoUri, tracker, configure, controlledTopics: [BOARD_TOPIC, UHRP_TOPIC], log: (...args: unknown[]) => observations.push(args) }
    overlay = await startOverlayNode({ ...nodeOptions, name: `${prefix}_a`, directory: path.join(output, 'overlay-a') })
    replica = await startOverlayNode({ ...nodeOptions, name: `${prefix}_b`, directory: path.join(output, 'overlay-b') })
    const contentNetwork = new ReferenceCHIRPNetwork()
    const content = new CHIRPContentStore(contentNetwork)
    const server = await ReferenceLCHServer.create({ issuerWallet: new ProtoWallet(PrivateKey.fromHex('63'.repeat(32))) as unknown as WalletInterface, publicBaseUrl: 'https://lch.tpnil.test', now, content,
      payees: [{ wallet: lchWalletBoundary(payees[0]), satoshis: 3, dutyUid: 'urn:tpnil:duty:availability', interest: 'content-availability', label: 'availability operator' }, { wallet: lchWalletBoundary(payees[1]), satoshis: 5, dutyUid: 'urn:tpnil:duty:creator', interest: 'creator', label: 'creator' }] })
    const image = referenceImage(), plaintextSha256 = sha256Hex(image)
    const published = await server.publish({ bytes: image, mediaType: 'image/png', name: 'tpnil-native-synthesis.png' })
    const assetId = toHex(published.assetId)
    const adOutputs: any[] = []
    for (const publication of content.publications()) for (const location of publication.locations) {
      const ad = await encodeUHRPAdvertisement(wallet, { uhrpUrl: publication.chirpURL, hostedFileLocation: location, expiryTime: Number(now() + 86400n), fileSize: Number(publication.logicalLength) })
      adOutputs.push({ lockingScript: ad.lockingScriptHex, satoshis: 1, outputDescription: 'Native signed UHRP location', basket: basket('tpnil-uhrp') })
    }
    const advertisements = finalized(await wallet.createAction({ description: 'TPNIL native UHRP advertisements', outputs: adOutputs, options: { randomizeOutputs: false, acceptDelayedBroadcast: false } }))
    await saveTransaction('uhrp-advertisements', advertisements)
    await submit(overlay.origin, advertisements, [UHRP_TOPIC])
    contentNetwork.setResolver(async uhrpUrl => {
      const found = await lookup(overlay.origin, UHRP_LOOKUP, { uhrpUrl })
      observations.push({ uhrpLookup: { uhrpUrl, answer: found } })
      return Promise.all(found.outputs.map(async (entry: any) => (await decodeAndVerifyUHRPAdvertisement(Transaction.fromBEEF(entry.beef).outputs[entry.outputIndex]!.lockingScript.toHex())).hostedFileLocation))
    })
    assertions.push({ id: 'NATIVE-SYNTHESIS-UHRP', verdict: 'PASS', outputs: adOutputs.length, txid: advertisements.id('hex') })
    const key = `native-board/${assetId}`
    const first = await encodeBoard({ id: sha256Hex(`${assetId}:1`), key, revision: 1, previous: null, createdAt: Number(now()), body: 'Native wallet synthesis post', attachment: { assetId, lch: toBase64Url(published.lch), mediaType: 'image/png', plaintextSha256 } })
    const firstTx = finalized(await wallet.createAction({ description: 'TPNIL native synthesis post', outputs: [{ lockingScript: first.lockingScriptHex, satoshis: 1, outputDescription: 'Signed synthesis board post', basket: basket('tpnil-synthesis-board') }], options: { randomizeOutputs: false, acceptDelayedBroadcast: false } }))
    await saveTransaction('board-create', firstTx)
    const firstIndex = firstTx.outputs.findIndex(o => o.lockingScript.toHex() === first.lockingScriptHex)
    if (firstIndex < 0) throw new Error('Native board output absent')
    await submit(overlay.origin, firstTx, [BOARD_TOPIC])
    const firstLookup = await lookup(overlay.origin, 'ls_tpnil_synthesis_board', { key })
    if (firstLookup.outputs.length !== 1) throw new Error('Native board was not returned by real overlay lookup')
    assertions.push({ id: 'NATIVE-SYNTHESIS-BOARD', verdict: 'PASS', txid: firstTx.id('hex') })
    contentNetwork.setHostMode(0, 'offline')
    const client = new ReferenceLCHClient(lchWalletBoundary(wallet), content, { now, endpointPolicy: { allowLocalOrigins: ['https://lch.tpnil.test'], connect: async (url, init) => { const response = await server.http.handle(new Request(url, init)); if (!response.ok) observations.push({ lch: String(url), status: response.status, bodyHex: Buffer.from(await response.clone().arrayBuffer()).toString('hex') }); return response } } })
    const acquired = await client.acquire(await client.prepare(published.lch))
    if (sha256Hex(acquired.plaintext) !== plaintextSha256 || acquired.receipts.length !== 2 || !acquired.recovered) throw new Error('Native LCH payment, delivery or recovered plaintext differs')
    const payment = Transaction.fromAtomicBEEF([...acquired.atomicBeef]); await saveTransaction('lch-payment', payment)
    const payeeOutputs = await Promise.all(payees.map(async p => (await p.listOutputs({ basket: 'default', include: 'locking scripts' })).outputs))
    const received = payeeOutputs.map(outputs => outputs.reduce((sum: number, o: any) => sum + o.satoshis, 0))
    if (received[0] !== 3 || received[1] !== 5) throw new Error(`Payee balances differ: ${received.join(',')}`)
    await fs.writeFile(path.join(output, 'lch.json'), canonicalJson({ assetId, plaintextSha256, plaintext: [...acquired.plaintext], lch: [...published.lch], licenseId: toHex(acquired.licenseId), license: [...encodeDeterministicCbor({ body: acquired.license.body, signatures: acquired.license.signatures })], receipts: acquired.receipts.map(receipt => [...encodeDeterministicCbor({ body: receipt.body, signatures: receipt.signatures })]), payeeOutputs: payeeOutputs.map(outputs => outputs.map((entry: any) => ({ outpoint: entry.outpoint, satoshis: entry.satoshis, lockingScript: entry.lockingScript }))), received }) + '\n')
    assertions.push({ id: 'NATIVE-SYNTHESIS-LCH', verdict: 'PASS', txid: payment.id('hex'), receipts: acquired.receipts.length, received, recovered: acquired.recovered, plaintextSha256 })
    contentNetwork.resetHosts()
    const firstOutpoint = `${firstTx.id('hex')}:${firstIndex}`
    const update = await encodeBoard({ id: sha256Hex(`${assetId}:2`), key, revision: 2, previous: firstOutpoint, createdAt: Number(now()), body: 'Native wallet synthesis post verified', attachment: first.record.attachment })
    const partial = await wallet.createAction({ description: 'TPNIL native synthesis revision', inputBEEF: firstTx.toBEEF(), inputs: [{ outpoint: `${firstTx.id('hex')}.${firstIndex}`, unlockingScriptLength: 74, inputDescription: 'Previous synthesis board token' }], outputs: [{ lockingScript: update.lockingScriptHex, satoshis: 1, outputDescription: 'Revised synthesis board post', basket: basket('tpnil-synthesis-board') }], options: { signAndProcess: false, randomizeOutputs: false } })
    if (!partial.signableTransaction) throw new Error('Native revision lacks signable transaction')
    const unsigned = Transaction.fromAtomicBEEF(partial.signableTransaction.tx)
    const inputIndex = unsigned.inputs.findIndex(input => input.sourceTXID === firstTx.id('hex') && input.sourceOutputIndex === firstIndex)
    if (inputIndex < 0) throw new Error('Native revision omitted the original token input')
    const signature = await new PushDrop(wallet).unlock(protocol, first.record.id, 'anyone').sign(unsigned, inputIndex)
    const revision = finalized(await wallet.signAction({ reference: partial.signableTransaction.reference, spends: { [inputIndex]: { unlockingScript: signature.toHex() } }, options: { acceptDelayedBroadcast: false } }))
    await saveTransaction('board-revision', revision); await submit(overlay.origin, revision, [BOARD_TOPIC])
    await syncPeer(replica, overlay.origin, BOARD_TOPIC)
    const result = await lookup(replica.origin, 'ls_tpnil_synthesis_board', { key })
    observations.push({ boardReplicaLookup: result })
    if (result.outputs.length !== 1 || Transaction.fromBEEF(result.outputs[0].beef).id('hex') !== revision.id('hex')) throw new Error('Replica did not converge on the native wallet revision')
    assertions.push({ id: 'NATIVE-SYNTHESIS-REVISION', verdict: 'PASS', previous: firstOutpoint, txid: revision.id('hex'), replica: true })
  } catch (error) {
    assertions.push({ id: 'NATIVE-SYNTHESIS-EXECUTION', verdict: 'FAIL', error: error instanceof Error ? error.stack : String(error) })
  } finally {
    for (const [name, resource] of [['overlay', overlay], ['replica', replica]] as const) if (resource) { try { await resource.close(); cleanup.push({ name, closed: true }) } catch (error) { cleanup.push({ name, closed: false, error: String(error) }) } }
    for (const payee of payees) await payee.destroy()
  }
  await fs.writeFile(path.join(output, 'events.json'), JSON.stringify(observations, null, 2) + '\n')
  const result = { schema: 'tpnil-native-synthesis@0.1.0', ...(fixtureVersion === 'validated-v2' ? { fixtureVersion, boardProtocol: protocol } : {}), claim: 'ENGINEERING_OBSERVATION_ONLY', boundary: 'API-driven unchanged native wallet with controlled Board, CHIRP hosts and LCH application; actual OverlayExpress, configured ChainTracks and Wallet Storage; no browser UI usability claim', adapters: ['LCH 0.1.0 base64url-to-standard-base64 BRC-29 derivation and remittance boundary, applied to payer and payees', 'Overlay 2.7.0 historical GASP transaction-identity deduplication; all distinct transactions retain upstream conflict validation'], assertions, transactions: transactions.map(({ role, txid }) => ({ role, txid })), cleanup, result: cleanup.some((item: any) => !item.closed) ? 'BLOCKED' : assertions.some(a => a.verdict === 'FAIL') ? 'FAIL' : 'PASS' }
  await fs.writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2) + '\n')
  return result
}
