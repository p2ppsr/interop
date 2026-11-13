// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict'
import {config, variants, queryArgs, nativeArgs, operations, ordinaryControlArgs, requestFor} from './baskets-model.js'

export const fixtureMetadataQueries = (prefix: string) => [
  {id:`${prefix}.sources`, args:queryArgs(config.sourceBasket)},
  {id:`${prefix}.ordinary`, args:queryArgs(config.ordinaryBasket)},
  ...variants.filter(row=>row.accepted).map(row=>({id:`${prefix}.${row.id}`,args:queryArgs(row.name)}))
]

/** The admitted WalletPermissionsManager encrypts private stored metadata with
 * SDK AES-GCM (32-byte IV and 16-byte tag). This checks opaque representation,
 * not authentication without a secret. Separate public reads must return the
 * exact declared plaintext, and snapshots retain every original cipher byte. */
export function assertOpaqueStoredInstructions(value: unknown, plaintext: string) {
  assert.equal(typeof value, 'string')
  assert.notEqual(value, plaintext, 'Encrypted storage must not disclose plaintext metadata')
  const bytes = Buffer.from(value as string, 'base64')
  assert.equal(bytes.toString('base64'), value, 'Stored metadata must use canonical base64')
  assert.equal(bytes.length, Buffer.byteLength(plaintext, 'utf8') + 48, 'Stored metadata differs from the pinned SDK envelope')
}

function call(report: any, id: string) {
  const rows = report.trace.filter((row: any) => row.id === id)
  assert.equal(rows.length, 1, `Exactly one ${id} is required`)
  return rows[0]
}

/** Expected public metadata comes only from declared earlier fixture/mutation
 * arguments. Later calls and provider-supplied strings cannot choose it. */
export function expectedInstructionsAt(report: any, queryId: string, outpoint: string): string {
  const query = call(report, queryId), limit = report.trace.indexOf(query)
  const native = call(report, 'fixture-native').result, external = report.trace.find((row:any)=>row.id==='fixture-external')?.result
  const values = new Map<string, string>()
  for (const row of report.trace.slice(0, limit)) {
    if (row.actor !== 'wallet' || row.error !== undefined) continue
    if (row.id === 'fixture-native') {
      for (const [index, output] of nativeArgs().outputs.entries()) values.set(`${native.txid}.${index}`, output.customInstructions)
      continue
    }
    const operation = operations.find(operation => operation.id === row.id)
    const args: any = row.id === 'control.internalizeAction' ? ordinaryControlArgs(external)
      : operation ? requestFor(operation, native, external) : undefined
    if (!args) continue
    assert.deepEqual(row.args, args, 'Metadata binding requires the declared public request')
    if (row.method === 'internalizeAction' && row.result?.accepted === true) {
      for (const output of args.outputs) values.set(`${external.txid}.${output.outputIndex}`, output.insertionRemittance.customInstructions)
    } else if (row.method === 'createAction' && typeof row.result?.txid === 'string') {
      for (const [index, output] of args.outputs.entries()) values.set(`${row.result.txid}.${index}`, output.customInstructions)
    }
  }
  assert.ok(values.has(outpoint), `No declared plaintext metadata for ${outpoint}`)
  return values.get(outpoint)!
}

export function verifyPublicOwnedInstructions(report: any, queryId: string, publicOutput: any, ownedOutput: any) {
  assert.equal(publicOutput.outpoint, ownedOutput.outpoint)
  const expected = expectedInstructionsAt(report, queryId, ownedOutput.outpoint)
  assert.equal(publicOutput.customInstructions, expected, 'Public customInstructions differ from the declared plaintext')
  assertOpaqueStoredInstructions(ownedOutput.customInstructions, expected)
}

/** Four declared public listOutputs queries cover every listed fixture output
 * before mutations and after the public CWI handle refresh. Relinquished outputs
 * no longer belong to a public basket; their complete private bytes must remain
 * exact in the independent snapshots. No listActions metadata field is assumed. */
export function verifyPublicFixtureMetadata(report: any, prefix: string, ownedRows: any[]) {
  const seen = new Set<string>()
  for (const query of fixtureMetadataQueries(prefix)) {
    const row = call(report, query.id)
    assert.equal(row.method, 'listOutputs'); assert.equal(row.actor, 'wallet'); assert.deepEqual(row.args, query.args)
    assert.equal(row.error, undefined); assert.ok(Array.isArray(row.result?.outputs))
    const expected = ownedRows.filter(output=>output.spendable&&output.basketName===query.args.basket)
    assert.equal(row.result.totalOutputs, expected.length); assert.equal(row.result.outputs.length, expected.length)
    assert.equal(new Set(row.result.outputs.map((output:any)=>output.outpoint)).size, expected.length)
    for (const output of row.result.outputs) {
      const matches = expected.filter(owned=>owned.outpoint===output.outpoint); assert.equal(matches.length,1)
      const owned = matches[0]
      assert.equal(output.satoshis, owned.satoshis); assert.equal(output.lockingScript, owned.lockingScript)
      assert.deepEqual([...output.tags].sort(), owned.tags)
      verifyPublicOwnedInstructions(report, query.id, output, owned)
      assert.ok(!seen.has(output.outpoint)); seen.add(output.outpoint)
    }
  }
  const native = call(report, 'fixture-native').result
  for (const [index, expected] of nativeArgs().outputs.entries()) {
    const matches = ownedRows.filter(owned=>owned.outpoint===`${native.txid}.${index}`); assert.equal(matches.length,1)
    const owned = matches[0]
    assert.equal(owned.satoshis,expected.satoshis); assert.equal(owned.lockingScript,expected.lockingScript)
    assertOpaqueStoredInstructions(owned.customInstructions,expected.customInstructions)
    assert.equal(seen.has(owned.outpoint),owned.spendable&&owned.basketName!==null,'Public basket metadata coverage differs from complete owned membership')
  }
}
