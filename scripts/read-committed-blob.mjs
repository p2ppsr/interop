import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'

export const maximumCommittedBlobBytes = 64 * 1024 * 1024

/** Read one exact Git blob without buffering git stdout in child_process.
 * Metadata pins the immutable object before any large output. The finite
 * admission bound, byte count and Git object hash are checked independently.
 */
export function readCommittedBlob(repository, revision, file, {maxBytes = maximumCommittedBlobBytes} = {}) {
  assert.match(revision, /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/, 'Committed source must be an exact object ID')
  assert.equal(typeof file, 'string')
  assert.ok(file.length > 0 && !path.posix.isAbsolute(file) && !/[\0\r\n\\]/.test(file) && file.split('/').every(part => part && part !== '.' && part !== '..'), 'Unsafe committed source path')
  assert.ok(Number.isSafeInteger(maxBytes) && maxBytes >= 0 && maxBytes <= maximumCommittedBlobBytes, 'Invalid committed blob byte bound')
  const options = {cwd: repository, env: {...process.env, GIT_NO_REPLACE_OBJECTS: '1'}, timeout: 30_000, maxBuffer: 64 * 1024}
  const metadata = execFileSync('git', ['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'], {...options, input: `${revision}\n${revision}:${file}\n`, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']})
  const lines = metadata.split('\n')
  assert.equal(lines.length, 3, 'Expected exact commit and blob metadata')
  assert.match(lines[0], new RegExp(`^${revision} commit [1-9][0-9]*$`), 'Source object must be the exact commit')
  const match = /^(?<oid>[a-f0-9]{40}|[a-f0-9]{64}) blob (?<size>0|[1-9][0-9]*)$/.exec(lines[1])
  assert.ok(match, 'Committed source path must resolve to exactly one blob')
  const {oid} = match.groups, size = Number(match.groups.size)
  assert.ok(Number.isSafeInteger(size) && size <= maxBytes, 'Committed blob exceeds the admitted byte bound')
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'tpnil-committed-blob-'))
  const output = path.join(temporary, 'blob')
  let fd
  try {
    fd = fs.openSync(output, 'wx', 0o600)
    execFileSync('git', ['cat-file', 'blob', oid], {...options, stdio: ['ignore', fd, 'pipe']})
    fs.closeSync(fd); fd = undefined
    assert.equal(fs.statSync(output).size, size, 'Committed blob byte count differs from its Git metadata')
    const bytes = fs.readFileSync(output)
    assert.equal(bytes.length, size)
    const actual = createHash(oid.length === 40 ? 'sha1' : 'sha256').update(`blob ${size}\0`).update(bytes).digest('hex')
    assert.equal(actual, oid, 'Committed blob bytes differ from their Git object identity')
    return bytes
  } finally {
    try { if(fd !== undefined) fs.closeSync(fd) }
    finally { fs.rmSync(temporary, {recursive: true, force: true}) }
  }
}
