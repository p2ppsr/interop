import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { assertSnapshotIdentity } from './native-output-snapshot.js'

export const nativeActionQueryResponseByteLimit = 192 * 1024 * 1024
const budget = 128 * 1024 * 1024
const hash = (value: Buffer | string) => createHash('sha256').update(value).digest('hex')
function object(value: any): asserts value is Record<string, any> { assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value)) }
const integer = (value: unknown, max = 2048) => assert.ok(Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= max)
const keys = (value: any, required: string[], optional: string[] = []) => { object(value); assert.deepEqual(Object.keys(value).sort(), [...required, ...optional.filter(key => Object.hasOwn(value, key))].sort()) }
const digest = (value: unknown) => assert.match(String(value), /^[a-f0-9]{64}$/)
const base64 = (value: unknown): Buffer => { assert.equal(typeof value, 'string'); const bytes = Buffer.from(value as string, 'base64'); assert.equal(bytes.toString('base64'), value); return bytes }
const stamp = (value: unknown) => { assert.equal(typeof value, 'string'); assert.match(value as string, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/); assert.ok(Number.isFinite(Date.parse(value as string))) }
/** Lossless raw JSON semantics for the independent RPC join. Keep number
 * lexemes and ordered object members: Go's typed decoder processes duplicate
 * case-insensitive field names in their original order. No source JSON object
 * can impersonate the private number class or the member-order side table. */
class ExactJSONNumber { constructor(readonly token: string) {} }
const exactMembers = new WeakMap<object, Array<[string, any, Buffer]>>()
// Go replaces each invalid UTF8 byte with RuneError; a valid UTF8 fast path
// avoids changing ordinary payloads. Raw token buffers always stay untouched.
function goUTF8(bytes: Buffer): string {
  try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes) } catch { /* preserve Go's per-invalid-byte replacement */ }
  let text = ''
  for (let i = 0; i < bytes.length;) {
    const b = bytes[i]!, size = b < 128 ? 1 : b >= 0xc2 && b <= 0xdf ? 2 : b >= 0xe0 && b <= 0xef ? 3 : b >= 0xf0 && b <= 0xf4 ? 4 : 0
    const next = bytes[i+1]!
    const valid = size > 0 && i+size <= bytes.length && Array.from(bytes.subarray(i+1,i+size)).every(x => x >= 0x80 && x <= 0xbf) && !(b===0xe0 && next<0xa0 || b===0xed && next>0x9f || b===0xf0 && next<0x90 || b===0xf4 && next>0x8f)
    if (valid) { text += bytes.subarray(i,i+size).toString('utf8'); i += size } else { text += '\ufffd'; i++ }
  }
  return text
}
const goString = (value: string) => Buffer.from(value, 'utf8').toString('utf8')
const goFold = (key: string) => goString(key).replace(/ſ/g, 's').replace(/K/g, 'k').toLowerCase()
function losslessJSON(bytes: Buffer): any {
  JSON.parse(goUTF8(bytes)) // Validate complete JSON syntax first.
  let index = 0
  const space = () => { while ([32,9,10,13].includes(bytes[index]!)) index++ }
  const parse = (): any => {
    space(); const start = index, char = bytes[index++]
    if (char === 34) { let escaped = false; while (index < bytes.length) { const next = bytes[index++]!; if (escaped) escaped = false; else if (next === 92) escaped = true; else if (next === 34) return JSON.parse(goUTF8(bytes.subarray(start,index))) }; throw new Error('Unterminated JSON string') }
    if (char === 123) {
      const value: Record<string, any> = {}, members: Array<[string, any, Buffer]> = []; space()
      if (bytes[index] === 125) { index++; exactMembers.set(value, members); return value }
      for (;;) { const key = parse(); assert.equal(typeof key, 'string'); space(); assert.equal(bytes[index++], 58); space(); const from = index, child = parse(); members.push([key, child, bytes.subarray(from,index)]); Object.defineProperty(value, key, { value: child, writable: true, configurable: true, enumerable: true }); space(); const next = bytes[index++]; if (next === 125) break; assert.equal(next, 44) }
      exactMembers.set(value, members); return value
    }
    if (char === 91) { const value: any[] = []; space(); if (bytes[index] === 93) { index++; return value }; for (;;) { value.push(parse()); space(); const next = bytes[index++]; if (next === 93) return value; assert.equal(next, 44) } }
    for (const [token, value] of [['null', null], ['true', true], ['false', false]] as const) if (bytes.subarray(start,start+token.length).toString() === token) { index = start + token.length; return value }
    let end = start; while (end < bytes.length && [45,43,46,69,101,48,49,50,51,52,53,54,55,56,57].includes(bytes[end]!)) end++
    const number = bytes.subarray(start,end).toString(); assert.match(number,/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/)
    index = end; return new ExactJSONNumber(number)
  }
  const result = parse(); space(); assert.equal(index, bytes.length); return result
}
// The host uses Go structs for envelopes/AuthID and a map for result values.
// Keep those decoders distinct, including exact RawMessage ID spelling.
function goStruct(raw: any, definition: Record<string, 'string'|'raw'|'rawArray'|'intPointer'|'boolPointer'>) {
  const values: Record<string, any> = Object.fromEntries(Object.entries(definition).filter(([,kind])=>kind==='string').map(([key])=>[key,'']))
  const tokens: Record<string, Buffer> = {}
  if (raw === null) return { values, tokens }
  object(raw); const members = exactMembers.get(raw); assert.ok(members)
  for (const [name, value, token] of members) {
    const field = Object.keys(definition).find(key => goFold(key) === goFold(name)); if (!field) continue
    const kind = definition[field]
    if (kind === 'raw') { values[field] = value; tokens[field] = token }
    else if (kind === 'rawArray') { assert.ok(value === null || Array.isArray(value)); values[field] = value }
    else if (kind === 'string') { if (value !== null) { assert.equal(typeof value,'string'); values[field] = goString(value) } }
    else if (kind === 'boolPointer') { assert.ok(value === null || typeof value === 'boolean'); values[field] = value }
    else if (value !== null) { assert.ok(value instanceof ExactJSONNumber && value.token.length <= 20 && /^-?(?:0|[1-9][0-9]*)$/.test(value.token)); const n = BigInt(value.token); assert.ok(n >= -9223372036854775808n && n <= 9223372036854775807n); values[field] = new ExactJSONNumber(n.toString()) }
    else values[field] = null
  }
  return { values, tokens }
}
function goMapValue(value: any): any {
  if (typeof value === 'string') return goString(value)
  if (value instanceof ExactJSONNumber || value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(goMapValue)
  const result: Record<string, any> = {}; for (const [key, child] of exactMembers.get(value) ?? Object.entries(value)) Object.defineProperty(result,goString(key),{value:goMapValue(child),writable:true,configurable:true,enumerable:true}); return result
}
/** Exact JSON projection of the pinned Go WDK ListActionsArgs struct, not CWI
 * normalization or a wallet contract predicate. Unknown request fields remain
 * in the raw evidence and, like encoding/json, do not enter the typed struct. */
function typedActionArguments(raw: any): any {
  const result: Record<string, any> = { labels: null, labelQueryMode: null }
  if (raw === null) return result
  object(raw); const members = exactMembers.get(raw); assert.ok(members)
  const booleans = ['seekPermission', 'includeInputs', 'includeOutputs', 'includeLabels', 'includeInputSourceLockingScripts', 'includeInputUnlockingScripts', 'includeOutputLockingScripts']
  const fields = ['labels', 'labelQueryMode', 'limit', 'offset', ...booleans]
  // encoding/json matches ASCII tag names using Unicode simple folding. The
  // only additional runes in those ASCII fold sets are long-s and Kelvin sign.
  let labelBacking: string[] | null = null
  for (const [name, value] of members) {
    const field = fields.find(key => goFold(key) === goFold(name)); if (!field) continue
    if (field === 'labels') {
      if (value === null) { result.labels = null; labelBacking = null; continue }
      assert.ok(Array.isArray(value)); if (!value.length) labelBacking = []
      const backing: string[] = labelBacking ?? []
      result.labels = value.map((item, index) => { assert.ok(item === null || typeof item === 'string'); const text = item === null ? backing[index] ?? '' : goString(item); backing[index] = text; return text }); labelBacking = backing
    } else if (field === 'labelQueryMode') { assert.ok(value === null || typeof value === 'string'); result[field] = value === null ? null : goString(value) }
    else if (booleans.includes(field)) { assert.ok(value === null || typeof value === 'boolean'); if (value === null) delete result[field]; else result[field] = value }
    else if (value !== null) {
      assert.ok(value instanceof ExactJSONNumber && value.token.length <= 20 && /^(?:0|[1-9][0-9]*)$/.test(value.token)); const number = BigInt(value.token)
      assert.ok(number <= 18446744073709551615n)
      if (number === 0n) delete result[field]; else result[field] = new ExactJSONNumber(number.toString())
    }
  }
  return result
}

export interface ActionBlobReference { sha256: string; bytes: number }
export interface NativeActionQueryEntry {
  sequence: number; requestSequence: number; startedAt: string; endedAt: string; httpMethod: 'POST'; path: string
  requestBody: ActionBlobReference; responseBody: ActionBlobReference; requestComplete: boolean; responseComplete: boolean
  status: number; rpcMethod: string; rpcId: unknown; identityKey: string | null; providerCalls: any[]
  rpcProviderBound: boolean; cwiJoin: 'UNAVAILABLE'; error?: string
}
export interface NativeActionQuerySummary {
  schema: 'tpnil-native-action-query-ledger@1.0.0'; providerIdentityKey: string; entryCount: number; requestCount: number
  inFlight: number; finalized: boolean; entriesSha256: string; bytes: number; terminalErrors: string[]
}
export interface NativeActionQueryCuts extends NativeActionQuerySummary {
  identityKey: string; from: number; through: number
  index: Array<{ sequence: number; identityKey: string | null; sha256: string }>
  entries: NativeActionQueryEntry[]; entryBase64: Record<string, string>; blobs: Record<string, string>
}
export interface NativeActionQueryFinalLedger {
  schema: 'tpnil-native-action-query-final-ledger@1.0.0'; capturedAt: string
  final: NativeActionQuerySummary; journalBase64: string; blobs: Record<string, string>; terminalErrorsBase64?: string
}
function summary(value: any): void {
  assert.equal(value.schema, 'tpnil-native-action-query-ledger@1.0.0'); assertSnapshotIdentity(value.providerIdentityKey)
  integer(value.entryCount); integer(value.requestCount, 100000); integer(value.inFlight, 100000); integer(value.bytes, budget)
  assert.equal(typeof value.finalized, 'boolean'); digest(value.entriesSha256)
  assert.ok(Array.isArray(value.terminalErrors) && value.terminalErrors.length <= 64)
  for (const error of value.terminalErrors) assert.ok(typeof error === 'string' && error.length > 0 && Buffer.byteLength(error) <= 8192)
}
function blob(ref: any, blobs: Record<string, string>, used: Set<string>): Buffer {
  keys(ref, ['sha256', 'bytes']); digest(ref.sha256); integer(ref.bytes, 32 * 1024 * 1024)
  assert.ok(Object.hasOwn(blobs, ref.sha256), 'Action ledger omitted a referenced blob')
  const value = base64(blobs[ref.sha256]); assert.equal(value.length, ref.bytes); assert.equal(hash(value), ref.sha256)
  used.add(ref.sha256); return value
}
export const nativeActionInventoryColumns: Readonly<Record<string, readonly string[]>> = Object.freeze({
  "actions": [
    "id",
    "user_id",
    "created_at",
    "updated_at",
    "deleted_at",
    "status",
    "reference",
    "is_outgoing",
    "satoshis",
    "description",
    "version",
    "lock_time",
    "tx_id",
    "input_beef"
  ],
  "outputs": [
    "id",
    "user_id",
    "created_at",
    "updated_at",
    "deleted_at",
    "transaction_id",
    "spent_by",
    "vout",
    "satoshis",
    "locking_script",
    "custom_instructions",
    "basket_name",
    "spendable",
    "change",
    "description",
    "provided_by",
    "purpose",
    "type"
  ],
  "labels": [
    "user_id",
    "name",
    "created_at",
    "updated_at",
    "deleted_at"
  ],
  "actionLabels": [
    "transaction_id",
    "label_user_id",
    "label_name",
    "created_at",
    "updated_at",
    "deleted_at"
  ],
  "tags": [
    "user_id",
    "name",
    "created_at",
    "updated_at",
    "deleted_at"
  ],
  "outputTags": [
    "output_id",
    "tag_user_id",
    "tag_name",
    "created_at",
    "updated_at",
    "deleted_at"
  ],
  "baskets": [
    "user_id",
    "name",
    "created_at",
    "updated_at",
    "deleted_at",
    "number_of_desired_utxos",
    "minimum_desired_utxo_value"
  ],
  "knownActions": [
    "tx_id",
    "created_at",
    "updated_at",
    "status",
    "raw_tx",
    "input_beef",
    "block_height",
    "merkle_path",
    "merkle_root",
    "block_hash"
  ]
})
function inventory(value: any, identity: string, provider: string): void {
  keys(value, ['schema', 'identityKey', 'providerIdentityKey', 'userId', 'tables'])
  assert.equal(value.schema, 'tpnil-native-action-inventory@1.0.0'); assert.equal(value.identityKey, identity); assert.equal(value.providerIdentityKey, provider)
  assert.match(value.userId, /^[1-9][0-9]*$/); keys(value.tables, ['actions', 'outputs', 'labels', 'actionLabels', 'tags', 'outputTags', 'baskets', 'knownActions'])
  for (const [name, table] of Object.entries(value.tables) as Array<[string, any]>) {
    assert.deepEqual(table.columns, nativeActionInventoryColumns[name], `Action inventory columns differ for${name}`)
    keys(table, ['columns', 'rows', 'count']); integer(table.count, 16384)
    assert.ok(Array.isArray(table.columns) && table.columns.length > 0 && table.columns.length <= 32 && new Set(table.columns).size === table.columns.length)
    for (const column of table.columns) assert.match(column, /^[a-z_]+$/)
    assert.ok(Array.isArray(table.rows)); assert.equal(table.rows.length, table.count)
    for (const row of table.rows) { assert.ok(Array.isArray(row)); assert.equal(row.length, table.columns.length)
      for (const cell of row) { keys(cell, ['kind'], ['value']); assert.ok(['null', 'integer', 'text', 'blob', 'time'].includes(cell.kind))
        if (cell.kind === 'null') assert.equal(cell.value, undefined)
        else { assert.ok(cell.value === undefined || typeof cell.value === 'string'); if (cell.kind === 'integer') assert.match(cell.value, /^(?:0|-?[1-9][0-9]*)$/); if (cell.kind === 'blob') assert.match(cell.value ?? '', /^(?:[a-f0-9]{2})*$/) }
      }
    }
  }
}
function entry(value: any, blobs: Record<string, string>, used: Set<string>, provider: string, rawEntry: Buffer): void {
  keys(value, ['sequence', 'requestSequence', 'startedAt', 'endedAt', 'httpMethod', 'path', 'requestBody', 'responseBody', 'requestComplete', 'responseComplete', 'status', 'rpcMethod', 'rpcId', 'identityKey', 'providerCalls', 'rpcProviderBound', 'cwiJoin'], ['error'])
  integer(value.sequence); assert.ok(value.sequence > 0); integer(value.requestSequence, 100000); assert.ok(value.requestSequence > 0)
  stamp(value.startedAt); stamp(value.endedAt); assert.ok(Date.parse(value.startedAt) <= Date.parse(value.endedAt))
  assert.equal(value.httpMethod, 'POST'); assert.equal(typeof value.path, 'string'); assert.ok(value.path.startsWith('/'))
  for (const field of ['requestComplete', 'responseComplete', 'rpcProviderBound']) assert.equal(typeof value[field], 'boolean')
  integer(value.status, 599); assert.equal(value.cwiJoin, 'UNAVAILABLE'); assert.equal(typeof value.rpcMethod, 'string')
  if (value.identityKey !== null) assertSnapshotIdentity(value.identityKey)
  if (value.error !== undefined) assert.equal(typeof value.error, 'string')
  const request = blob(value.requestBody, blobs, used), response = blob(value.responseBody, blobs, used)
  assert.ok(Array.isArray(value.providerCalls) && value.providerCalls.length <= 2048)
  for (const call of value.providerCalls) {
    keys(call, ['identityKey', 'userId', 'args', 'result', 'cut'], ['error']); assertSnapshotIdentity(call.identityKey)
    assert.ok(call.userId === null || typeof call.userId === 'string' && /^[1-9][0-9]*$/.test(call.userId))
    const cut = call.cut; keys(cut, ['schema', 'identityKey', 'startedAt', 'callStartedAt', 'callEndedAt', 'endedAt', 'versions', 'before', 'after', 'stable'], ['error'])
    assert.equal(cut.schema, 'tpnil-native-action-query-cut@1.0.0'); assert.equal(cut.identityKey, call.identityKey); assert.equal(typeof cut.stable, 'boolean')
    for (const name of ['startedAt', 'callStartedAt', 'callEndedAt', 'endedAt']) stamp(cut[name])
    assert.ok(Date.parse(value.startedAt) <= Date.parse(cut.startedAt) && Date.parse(cut.startedAt) <= Date.parse(cut.callStartedAt) && Date.parse(cut.callStartedAt) <= Date.parse(cut.callEndedAt) && Date.parse(cut.callEndedAt) <= Date.parse(cut.endedAt) && Date.parse(cut.endedAt) <= Date.parse(value.endedAt))
    assert.ok(Array.isArray(cut.versions) && cut.versions.length <= 4); for (const version of cut.versions) assert.match(version, /^[1-9][0-9]*$/)
    for (const name of ['before', 'after']) if (cut[name] !== null) inventory(JSON.parse(blob(cut[name], blobs, used).toString()), call.identityKey, provider)
    if (cut.stable) { assert.equal(cut.error, undefined); assert.equal(cut.versions.length, 4); assert.equal(new Set(cut.versions).size, 1); assert.deepEqual(cut.before, cut.after); assert.ok(cut.before); const before = JSON.parse(blob(cut.before, blobs, used).toString()); assert.equal(before.userId, call.userId) }
  }
  if (value.rpcProviderBound) {
    assert.equal(value.error, undefined); assert.equal(value.providerCalls.length, 1); assert.equal(value.requestComplete, true); assert.equal(value.responseComplete, true)
    const call = value.providerCalls[0]; assert.equal(call.cut.stable, true); assert.equal(call.identityKey, value.identityKey)
    const requestEnvelope = goStruct(losslessJSON(request), { jsonrpc: 'string', id: 'raw', method: 'string', params: 'rawArray' })
    const responseEnvelope = goStruct(losslessJSON(response), { jsonrpc: 'string', id: 'raw', result: 'raw', error: 'raw' })
    const req = requestEnvelope.values, res = responseEnvelope.values, exactEntry = losslessJSON(rawEntry), exactCall = exactEntry.providerCalls[0]
    assert.equal(req.jsonrpc, '2.0'); assert.equal(res.jsonrpc, '2.0')
    assert.deepEqual(requestEnvelope.tokens.id ?? Buffer.alloc(0), responseEnvelope.tokens.id ?? Buffer.alloc(0), 'Raw JSON-RPC ID bytes differ')
    assert.deepEqual(goMapValue(req.id === undefined ? null : req.id), goMapValue(exactEntry.rpcId))
    assert.equal(req.method, value.rpcMethod); assert.ok(['listActions', 'storage.listActions'].includes(req.method)); assert.ok(Array.isArray(req.params)); assert.equal(req.params.length, 2)
    const auth = goStruct(req.params[0], { identityKey: 'string', userId: 'intPointer', isActive: 'boolPointer' }).values
    assert.equal(auth.identityKey, call.identityKey) // Server resolves UserID independently; never trust the supplied userId.
    assert.deepEqual(typedActionArguments(req.params[1]), goMapValue(exactCall.args), 'Raw RPC arguments differ from the pinned typed WDK invocation')
    // Native CWI translation remains UNAVAILABLE. Correlation follows only the
    // source-owned RPC adapter; strict wallet result predicates run separately.
    if (call.error === undefined) { assert.ok(res.error === undefined || res.error === null); assert.deepEqual(goMapValue(res.result), goMapValue(exactCall.result)) }
    else { assert.equal(res.result, undefined); object(res.error); assert.ok(Object.hasOwn(goMapValue(res.error), 'message')) }

  }
}
function allBlobs(blobs: any): void { object(blobs); let bytes = 0; for (const [name, value] of Object.entries(blobs)) { digest(name); const raw = base64(value); assert.equal(hash(raw), name); bytes += raw.length; assert.ok(raw.length <= 32 * 1024 * 1024 && bytes <= budget) } }
export function validateNativeActionQueryCuts(value: unknown, identity: string, provider?: string): NativeActionQueryCuts {
  const v = value as NativeActionQueryCuts
  keys(v, ['schema', 'providerIdentityKey', 'entryCount', 'requestCount', 'inFlight', 'finalized', 'entriesSha256', 'bytes', 'terminalErrors', 'identityKey', 'from', 'through', 'index', 'entries', 'entryBase64', 'blobs']); summary(v); assert.equal(v.identityKey, identity); assertSnapshotIdentity(identity); if (provider) assert.equal(v.providerIdentityKey, provider)
  integer(v.from, 2049); integer(v.through); assert.ok(v.from > 0 && v.through >= v.from - 1 && v.through <= v.entryCount)
  assert.ok(Array.isArray(v.index) && Array.isArray(v.entries)); assert.equal(v.index.length, v.through - v.from + 1); allBlobs(v.blobs)
  const expected = new Map<number, string>()
  v.index.forEach((row, index) => { keys(row, ['sequence', 'identityKey', 'sha256']); assert.equal(row.sequence, v.from + index); digest(row.sha256); if (row.identityKey !== null) assertSnapshotIdentity(row.identityKey); if (row.identityKey === identity) expected.set(row.sequence, row.sha256) })
  assert.equal(v.entries.length, expected.size); keys(v.entryBase64, [...expected.keys()].map(String)); const used = new Set<string>(), requests = new Set<number>()
  for (const row of v.entries) { assert.ok(expected.has(row.sequence)); const rawEntry = base64(v.entryBase64[String(row.sequence)]); assert.equal(hash(rawEntry), expected.get(row.sequence)); assert.deepEqual(JSON.parse(rawEntry.toString()), row); expected.delete(row.sequence); assert.equal(row.identityKey, identity); entry(row, v.blobs, used, v.providerIdentityKey, rawEntry); assert.ok(!requests.has(row.requestSequence)); requests.add(row.requestSequence) }
  assert.deepEqual([...used].sort(), Object.keys(v.blobs).sort()); return v
}
export function validateNativeActionQueryFinalLedger(value: unknown, provider?: string): NativeActionQueryFinalLedger {
  const v = value as NativeActionQueryFinalLedger; keys(v, ['schema', 'capturedAt', 'final', 'journalBase64', 'blobs'], ['terminalErrorsBase64']); assert.equal(v.schema, 'tpnil-native-action-query-final-ledger@1.0.0'); stamp(v.capturedAt)
  keys(v.final, ['schema', 'providerIdentityKey', 'entryCount', 'requestCount', 'inFlight', 'finalized', 'entriesSha256', 'bytes', 'terminalErrors']); summary(v.final); if (provider) assert.equal(v.final.providerIdentityKey, provider)
  if (v.terminalErrorsBase64 !== undefined) {
    const raw = base64(v.terminalErrorsBase64); assert.ok(raw.length <= 256 * 1024)
    const errors: unknown = JSON.parse(raw.toString()); assert.ok(Array.isArray(errors) && errors.length <= 32)
    for (const error of errors) assert.ok(typeof error === 'string' && error.length > 0 && Buffer.byteLength(error) <= 8192)
    // The Go final summary appends provider errors after its retained failure
    // list. A later terminal file may expose post-final failures; disagreement
    // must reject admission while the raw failure capture preserves both files.
    assert.deepEqual(v.final.terminalErrors.slice(0, errors.length), errors)
  }
  const journal = base64(v.journalBase64); assert.ok(journal.length <= budget); assert.ok(journal.length === 0 || journal.at(-1) === 10)
  const lines = journal.length ? journal.toString().slice(0, -1).split('\n') : []; assert.equal(lines.length, v.final.entryCount)
  assert.equal(hash(`[${lines.join(',')}]`), v.final.entriesSha256); allBlobs(v.blobs)
  const used = new Set<string>(), requests = new Set<number>(); lines.forEach((line, index) => { const row = JSON.parse(line); assert.equal(row.sequence, index + 1); entry(row, v.blobs, used, v.final.providerIdentityKey, Buffer.from(line)); assert.ok(!requests.has(row.requestSequence)); requests.add(row.requestSequence); assert.ok(row.requestSequence <= v.final.requestCount) })
  // Interrupted retention may leave already flushed but unreferenced blobs. They
  // remain hashed evidence and are never silently dropped; terminal errors must
  // still prevent admission even if earlier entries are internally coherent.
  return v
}
export function readNativeActionQueryFinalLedger(directory: string): NativeActionQueryFinalLedger {
  const read = (name: string, max: number): Buffer => { const target = path.join(directory, name); const stat = fs.lstatSync(target); assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.size <= max); return fs.readFileSync(target) }
  const final = JSON.parse(read('final.json', 64 * 1024).toString()), journal = read('entries.jsonl', budget), blobs: Record<string, string> = {}; let total = journal.length
  for (const name of fs.readdirSync(directory).sort()) { if (['final.json', 'entries.jsonl', 'terminal-errors.json'].includes(name)) continue; assert.match(name, /^[a-f0-9]{64}\.blob$/); const bytes = read(name, 32 * 1024 * 1024); total += bytes.length; assert.ok(total <= budget + 2048); assert.equal(hash(bytes), name.slice(0, -5)); blobs[name.slice(0, -5)] = bytes.toString('base64') }
  const terminalErrorsBase64 = fs.existsSync(path.join(directory, 'terminal-errors.json')) ? read('terminal-errors.json', 256 * 1024).toString('base64') : undefined
  return validateNativeActionQueryFinalLedger({ schema: 'tpnil-native-action-query-final-ledger@1.0.0', capturedAt: new Date().toISOString(), final, journalBase64: journal.toString('base64'), blobs, ...(terminalErrorsBase64 === undefined ? {} : { terminalErrorsBase64 }) })
}

/** Diagnostic-only capture: malformed bytes never become an admitted ledger.
 * Capture occurs after process exit, before owned temporary-state removal.
 * Oversize/unreadable/unknown entries are explicitly recorded, not silently
 * interpreted as absent or as a complete successful observation. */
export interface NativeActionQueryFailureBundle {
  schema: 'tpnil-native-action-query-failure-bundle@1.0.0'
  capturedAt: string
  files: Array<{ name: string; observedBytes?: number; retainedBytes: number; sha256: string; base64: string; complete: boolean; error?: string }>
  errors: string[]
}
export function readNativeActionQueryFailureBundle(directory: string): NativeActionQueryFailureBundle {
  const result: NativeActionQueryFailureBundle = { schema: 'tpnil-native-action-query-failure-bundle@1.0.0', capturedAt: new Date().toISOString(), files: [], errors: [] }
  const message = (error: unknown) => String(error).slice(0, 8192)
  let remaining = budget + 512 * 1024
  try {
    const directoryStat = fs.lstatSync(directory); assert.ok(directoryStat.isDirectory() && !directoryStat.isSymbolicLink(), 'Action ledger path is not an owned directory')
    const names = fs.readdirSync(directory).sort()
    const fixed = ['final.json', 'terminal-errors.json', 'entries.jsonl']
    const inventory = [...fixed, ...names.filter(name => !fixed.includes(name))]
    if (inventory.length > 8195) result.errors.push('Action ledger file count exceeds diagnostic limit; remaining names unavailable')
    for (const name of inventory.slice(0, 8195)) {
      const row: NativeActionQueryFailureBundle['files'][number] = { name, retainedBytes: 0, sha256: hash(Buffer.alloc(0)), base64: '', complete: false }
      result.files.push(row)
      let descriptor: number | undefined
      try {
        assert.ok(fixed.includes(name) || /^[a-f0-9]{64}\.blob$/.test(name), 'Unexpected file name; contents not read')
        const target = path.join(directory, name), stat = fs.lstatSync(target)
        row.observedBytes = stat.size
        assert.ok(stat.isFile() && !stat.isSymbolicLink(), 'Nonregular action ledger member; contents not read')
        const maximum = name === 'final.json' ? 64 * 1024 : name === 'terminal-errors.json' ? 256 * 1024 : name === 'entries.jsonl' ? budget : 32 * 1024 * 1024
        const length = Math.min(stat.size, maximum, remaining)
        descriptor = fs.openSync(target, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)
        const opened = fs.fstatSync(descriptor); assert.equal(opened.dev, stat.dev); assert.equal(opened.ino, stat.ino); assert.equal(opened.size, stat.size)
        const raw = Buffer.alloc(length); let offset = 0
        while (offset < length) { const read = fs.readSync(descriptor, raw, offset, length - offset, offset); if (read === 0) break; offset += read }
        const retained = raw.subarray(0, offset)
        row.retainedBytes = retained.length; row.sha256 = hash(retained); row.base64 = retained.toString('base64'); remaining -= retained.length
        row.complete = retained.length === stat.size
        if (!row.complete) row.error = 'Diagnostic member truncated by bounded capture or early EOF'
      } catch (error) { row.error = message(error) }
      finally { if (descriptor !== undefined) try { fs.closeSync(descriptor) } catch (error) { row.error = [row.error, message(error)].filter(Boolean).join('; '); row.complete = false } }
    }
  } catch (error) { result.errors.push(message(error)) }
  return result
}
