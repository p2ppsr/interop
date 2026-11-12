// SPDX-License-Identifier: Apache-2.0
import { Transaction } from '@bsv/sdk'

export const clauseOracle4Id = 'tpnil-brc100-clause-oracle@4.0.0'
export const noSendChangeInputId = 'input.createAction.options.noSendChange.0'
export const noSendChangeOutputId = 'output.createAction.noSendChange-final-outpoints'
export const noSendChangeSetupId = `setup.${noSendChangeInputId}`
export const noSendChangeReadId = 'setup.noSendChange.public-actions'
export const noSendChangeLabel = 'tpnil oracle4 nosend anchor'
export function noSendChangeSetupArgs(revision: 1 | 2 = 1) {
  return { description: 'TPNIL oracle4 noSend change anchor', outputs: [{ satoshis: revision === 2 ? 997 : 1, lockingScript: '51', outputDescription: 'TPNIL noSend anchor output', basket: 'tpnil nosend anchor' }], labels: [noSendChangeLabel], options: { noSend: true, randomizeOutputs: false } }
}
export function noSendChangeReadArgs() {
  return { labels: [noSendChangeLabel], labelQueryMode: 'all', includeOutputs: true, includeOutputLockingScripts: true, includeLabels: true, limit: 10, offset: 0 }
}

/** Read the signed action through public methods. The returned noSendChange is
 * retained untouched and scored separately; it is not the fixture's authority. */
export async function prepareNoSendChangeFixture(call: (id: string, method: string, args: any) => Promise<any>, revision: 1 | 2 = 1) {
  const pendingBatch = await call(noSendChangeSetupId, 'createAction', noSendChangeSetupArgs(revision))
  const publicRead = await call(noSendChangeReadId, 'listActions', noSendChangeReadArgs())
  let outpoints: string[] | undefined
  try {
    const tx = Transaction.fromAtomicBEEF(pendingBatch.result.tx)
    if (tx.id('hex') !== pendingBatch.result.txid) throw Error('Signed action txid differs')
    const actions = publicRead.result.actions.filter((row: any) => row.txid === tx.id('hex'))
    if (publicRead.result.totalActions !== 1 || publicRead.result.actions.length !== 1 || actions.length !== 1) throw Error('Public action lookup is not unique')
    outpoints = actions[0].outputs.filter((row: any) => row.basket === 'default' && row.spendable === true && Number.isSafeInteger(row.outputIndex) && row.outputIndex > 0 && tx.outputs[row.outputIndex]?.satoshis === row.satoshis && tx.outputs[row.outputIndex]?.lockingScript.toHex() === row.lockingScript).map((row: any) => `${tx.id('hex')}.${row.outputIndex}`)
    if (!outpoints?.length) outpoints = undefined
  } catch { /* Missing positive evidence remains BLOCKED; no outpoint is invented. */ }
  return { pendingBatch, outpoints }
}
