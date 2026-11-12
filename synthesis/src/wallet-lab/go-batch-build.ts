import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { canonicalJson } from '../determinism.js'

const root = path.resolve(import.meta.dirname, '../../..')
const digest = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex')

/** Reconstruct the source inventory and generated single-process host. A build
 * receipt's claimed tests never substitute for exact source/patch admission. */
export function validateBatchBuildInputs(manifest: Record<string, unknown>, dustAccounting = false, mergeAccounting = false, inputAncestry = false, sqliteRetry = false): void {
  const layer = sqliteRetry ? 'sqlite-retry' : inputAncestry ? 'input-ancestry' : mergeAccounting ? 'merge-accounting' : dustAccounting ? 'dust-accounting' : 'batch-subjects'
  const hostRoot = path.join(root, 'synthesis/go')
  const sources = fs.readdirSync(hostRoot, { recursive: true, withFileTypes: true })
    .filter(e => e.isFile() && e.name.endsWith('.go'))
    .map(e => path.relative(root, path.join(e.parentPath, e.name)).split(path.sep).join('/')).sort()
  const names = [`scripts/prepare-storage-${layer}-go.mjs`,
    'infra/adapters/storage-native-contracts/rpc-contract-test.mjs', 'synthesis/package-lock.json',
    'synthesis/go/components.lock.json', 'synthesis/go/go.mod', 'synthesis/go/go.sum', ...sources]
  const expected = Object.fromEntries(names.map(name => [name, digest(fs.readFileSync(path.join(root, name)))]))
  assert.equal(canonicalJson(manifest.inputs), canonicalJson(expected), 'Batch compatibility source inventory differs')
  const patchInputs: Record<string, string> = {}, seen = new Set<string>()
  let next: string | undefined = `infra/adapters/storage-${layer}/patch.lock.json`
  while (next) {
    assert.ok(!seen.has(next)); seen.add(next)
    assert.match(next, /^infra\/adapters\/[a-z-]+\/patch\.lock\.json$/)
    const bytes = fs.readFileSync(path.join(root, next)), lock = JSON.parse(bytes.toString())
    patchInputs[next] = digest(bytes)
    const patchName = path.posix.join(path.posix.dirname(next), lock.patch)
    assert.ok(patchName.startsWith(path.posix.dirname(next) + '/'))
    const patch = fs.readFileSync(path.join(root, patchName))
    assert.equal(digest(patch), lock.patchSha256)
    patchInputs[patchName] = digest(patch)
    if (lock.parent) assert.equal(digest(fs.readFileSync(path.join(root, lock.parent))), lock.parentSha256)
    next = lock.parent
  }
  assert.equal(canonicalJson(manifest.patchInputs), canonicalJson(patchInputs), 'Batch patch ancestry differs')
  const generated: Record<string, string> = {}
  for (const name of fs.readdirSync(path.join(hostRoot, 'cmd/itcve-services')).sort()) {
    if (!name.endsWith('.go') || name.endsWith('_test.go')) continue
    let bytes = fs.readFileSync(path.join(hostRoot, 'cmd/itcve-services', name))
    if (name === 'main.go') {
      const text = bytes.toString(), anchor = '\t\tmux.Handle("GET /control/action-references", actionReferencesHandler(provider.Database.DB, *token))'
      assert.equal(text.split(anchor).length, 2)
      bytes = Buffer.from(text.replace(anchor, anchor + '\n\t\tmux.Handle("GET /control/v2/native-output-snapshot", nativeOutputSnapshotHandler(provider.Database.DB, *token))'))
    }
    generated[name] = digest(bytes)
  }
  generated['native_output_snapshot.go'] = digest(fs.readFileSync(path.join(hostRoot, 'cmd/itcve-services-batch-subjects/native_output_snapshot.go')))
  assert.equal(canonicalJson(manifest.generatedHost), canonicalJson(generated), 'Batch generated single-process host differs')
}
