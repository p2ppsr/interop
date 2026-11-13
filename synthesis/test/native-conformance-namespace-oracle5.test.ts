// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { clauseContract, clauseOracle4AssertionIds, specifiedError } from '../src/wallet-lab/native/conformance-clauses-model.js'
import { clauseOracle4Id } from '../src/wallet-lab/native/conformance-nosend-change.js'
import { clauseOracle5Id, namespaceOracle5Policy, reservedNamespaceRejection } from '../src/wallet-lab/native/conformance-namespace-oracle5.js'
import { deriveClauseOutcomes, verifyNativeClauseConformance } from '../src/wallet-lab/native/verify-conformance-clauses.js'

const archive = path.resolve(import.meta.dirname, '../../journals/integrated-native-attempts/2026-11-09/42711700295/native-integrated.zip')
const digest = () => createHash('sha256').update(fs.readFileSync(archive)).digest('hex')
const originalDigest = 'c0645821afeea30cbc1c0c70f4ca10bfbe288ebfa570b719af5a709f145c3826'
const counts = (rows: any[]) => Object.fromEntries(['PASS', 'FAIL', 'BLOCKED'].map(result => [result, rows.filter(row => row.result === result).length]))
const reservedIds = ['namespace.protocol.reserved', 'namespace.basket.reserved']
const syntheticReport = () => ({ oracle: clauseOracle5Id, source: structuredClone(clauseContract.source), claim: 'LAB_SELF_TEST_ONLY' })
const rejection = (index = 0) => ({ ...structuredClone(namespaceOracle5Policy.calls[index]), error: { name: 'Error', message: 'Unsupported P-module scheme: p tpnil' } })

describe('Prospective reserved namespace oracle5', () => {
  it('pins the normative source and preserves the separate structured-error obligation', () => {
    expect(namespaceOracle5Policy.source).toEqual(clauseContract.source)
    expect(namespaceOracle5Policy.inherits).toBe(clauseOracle4Id)
    expect(namespaceOracle5Policy.calls.map((row: any) => row.id)).toEqual(reservedIds)
    for (const index of [0, 1]) {
      expect(reservedNamespaceRejection(syntheticReport(), rejection(index))).toBe(true)
      expect(specifiedError(rejection(index).error)).toBe(false)
    }
  })

  it.each([
    ['legacy oracle', (report: any) => { report.oracle = clauseOracle4Id }],
    ['missing oracle', (report: any) => { delete report.oracle }],
    ['different standard revision', (report: any) => { report.source.commit = '0'.repeat(40) }],
    ['different standard bytes', (report: any) => { report.source.sha256 = '0'.repeat(64) }],
    ['missing standard identity', (report: any) => { delete report.source }]
  ] as const)('does not reinterpret %s', (_label, mutate) => {
    const report = syntheticReport(); mutate(report)
    expect(reservedNamespaceRejection(report, rejection())).toBe(false)
  })

  it.each([
    ['accepted response', (row: any) => { row.result = { publicKey: '03' + '01'.repeat(32) } }],
    ['null response', (row: any) => { row.result = null }],
    ['wrong method', (row: any) => { row.method = 'encrypt' }],
    ['wrong namespace ID', (row: any) => { row.id = 'namespace.protocol.uppercase' }],
    ['ordinary namespace', (row: any) => { row.args.protocolID[1] = 'tpnil clauses' }],
    ['different reserved scheme', (row: any) => { row.args.protocolID[1] = 'p other clauses' }],
    ['different security level', (row: any) => { row.args.protocolID[0] = 1 }],
    ['different key context', (row: any) => { row.args.keyID = 'another key' }],
    ['different peer', (row: any) => { row.args.counterparty = 'self' }],
    ['unrecorded extra argument', (row: any) => { row.args.seekPermission = false }],
    ['missing error', (row: any) => { delete row.error }],
    ['engine exception', (row: any) => { row.error.name = 'TypeError' }],
    ['generic unsupported operation', (row: any) => { row.error.message = 'Unsupported operation' }],
    ['unrelated module', (row: any) => { row.error.message = 'Unsupported P-module scheme: p other' }],
    ['timeout with matching suffix', (row: any) => { row.error.message = 'Request timed out: Unsupported P-module scheme: p tpnil' }],
    ['transport failure', (row: any) => { row.error.message = 'WalletStorageClient rpcCall: network error 500 500' }],
    ['permission failure', (row: any) => { row.error.message = 'Permission denied' }]
  ] as const)('rejects %s as namespace evidence', (_label, mutate) => {
    const row = rejection(); mutate(row)
    expect(reservedNamespaceRejection(syntheticReport(), row)).toBe(false)
  })

  it.each([1, 2])('changes only the two refusals in immutable original repetition %i', async repetition => {
    expect(digest()).toBe(originalDigest)
    const bytes = execFileSync('unzip', ['-p', archive, `repetition-${repetition}/evidence/conformance/clauses.json`], { maxBuffer: 8 * 1024 * 1024 })
    const original = JSON.parse(bytes.toString('utf8'))
    const serialized = JSON.stringify(original)
    const oldVerified = await verifyNativeClauseConformance(original)
    expect(counts(oldVerified.assertions)).toEqual({ PASS: 133, FAIL: 99, BLOCKED: 1 })
    const prospective = { ...structuredClone(original), oracle: clauseOracle5Id }
    prospective.assertions = await deriveClauseOutcomes(prospective)
    expect(prospective.assertions.map((row: any) => row.id)).toEqual(clauseOracle4AssertionIds)
    expect(prospective.assertions.filter((row: any, index: number) => row.result !== oldVerified.assertions[index]!.result).map((row: any) => row.id)).toEqual(reservedIds)
    expect(counts(prospective.assertions)).toEqual({ PASS: 135, FAIL: 97, BLOCKED: 1 })
    for (const id of ['errors.structured', 'namespace.protocol.uppercase', 'output.createAction.noSendChange-final-outpoints']) expect(prospective.assertions.find((row: any) => row.id === id).result).toBe('FAIL')
    expect((await verifyNativeClauseConformance(prospective)).verified).toBe(true)
    const duplicate = structuredClone(prospective)
    duplicate.trace.push(structuredClone(duplicate.trace.find((row: any) => row.id === reservedIds[0])))
    expect((await deriveClauseOutcomes(duplicate)).find(row => row.id === reservedIds[0])?.result).toBe('FAIL')
    expect(JSON.stringify(original)).toBe(serialized)
    expect(digest()).toBe(originalDigest)
  }, 30_000)
})
