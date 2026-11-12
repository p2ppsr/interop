import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { canonicalJson } from '../determinism.js'

const root = path.resolve(import.meta.dirname, '../../..')
const digest = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex')

/** Reconstruct the source inventory and generated single-process host. A build
 * receipt's claimed tests never substitute for exact source/patch admission. */
export function validateBatchBuildInputs(manifest: Record<string, unknown>, dustAccounting = false, mergeAccounting = false, inputAncestry = false, sqliteRetry = false, callerKnownInputs = false): void {
  const layer = callerKnownInputs ? 'caller-known-inputs' : sqliteRetry ? 'sqlite-retry' : inputAncestry ? 'input-ancestry' : mergeAccounting ? 'merge-accounting' : dustAccounting ? 'dust-accounting' : 'batch-subjects'
  const hostRoot = path.join(root, 'synthesis/go')
  const sources = fs.readdirSync(hostRoot, { recursive: true, withFileTypes: true })
    .filter(e => e.isFile() && e.name.endsWith('.go'))
    .map(e => path.relative(root, path.join(e.parentPath, e.name)).split(path.sep).join('/'))
    .filter(name => callerKnownInputs || !name.startsWith('synthesis/go/cmd/itcve-services-coverage-observers/')).sort()
  const names = [`scripts/prepare-storage-${layer}-go.mjs`,
    'infra/adapters/storage-native-contracts/rpc-contract-test.mjs', 'synthesis/package-lock.json',
    ...(callerKnownInputs ? ['infra/adapters/storage-caller-known-inputs/LICENSE-sdk', 'infra/adapters/storage-caller-known-inputs/LICENSE-toolbox', 'infra/adapters/storage-caller-known-inputs/module-projection.json', 'infra/adapters/storage-caller-known-inputs/upstream-toolbox.go.mod'] : []),
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
    if (callerKnownInputs && lock.sdkPatch) {
      const sdkPath = path.posix.join(path.posix.dirname(next), lock.sdkPatch.patch)
      assert.ok(sdkPath.startsWith(path.posix.dirname(next) + '/'))
      const sdkBytes = fs.readFileSync(path.join(root, sdkPath))
      assert.equal(digest(sdkBytes), lock.sdkPatch.patchSha256)
      patchInputs[sdkPath] = digest(sdkBytes)
    }
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
      bytes = Buffer.from(text.replace(anchor, anchor + '\n\t\tmux.Handle("GET /control/v2/native-output-snapshot", nativeOutputSnapshotHandler(provider.Database.DB, *token))' + (callerKnownInputs ? '\n\t\tmux.Handle("GET /control/v1/native-certificate-inventory", certificateInventoryHandler(provider.Database.DB, *token))\n\t\tmux.Handle("GET /control/v1/transaction-knowledge-inventory", transactionKnowledgeInventoryHandler(provider.Database.DB, *token))' : '')))
      if (callerKnownInputs) {
        let main = bytes.toString()
        const replaceAction = (before: string, after: string) => { assert.equal(main.split(before).length, 2, 'Action host source anchor differs'); main = main.replace(before, after) }
        replaceAction('func run() error {', 'func run() (runError error) {');
        replaceAction('\t\trpc := storage.NewServer(logger, provider, authWallet, storage.ServerOptions{Monetize: false, DisableCORS: true})', '\t\tactionObserver, err := newActionLedger(provider, provider.Database.DB, db.SQLite.ConnectionString, filepath.Join(*state, "action-query-ledger"), identity)\n\t\tif err != nil { return err }\n\t\tdefer func() { closeContext, done := context.WithTimeout(context.Background(), 10*time.Second); defer done(); runError = errors.Join(runError, actionObserver.Close(closeContext)) }()\n\t\tmux.Handle("GET /control/v1/native-action-query-cuts", actionObserver.ControlHandler(*token))\n\t\trpc := storage.NewServer(logger, actionObserver.provider, authWallet, storage.ServerOptions{Monetize: false, DisableCORS: true})');
        replaceAction('storageBrowserHandler(rpc.Handler())', 'storageBrowserHandler(actionObserver.Handler(rpc.Handler()))');
        bytes = Buffer.from(main)
      }

    }
    generated[name] = digest(bytes)
  }
  generated['native_output_snapshot.go'] = digest(fs.readFileSync(path.join(hostRoot, 'cmd/itcve-services-batch-subjects/native_output_snapshot.go')))
  if (callerKnownInputs) for (const name of fs.readdirSync(path.join(hostRoot, 'cmd/itcve-services-coverage-observers')).sort()) if (name.endsWith('.go') && !name.endsWith('_test.go')) generated[name] = digest(fs.readFileSync(path.join(hostRoot, 'cmd/itcve-services-coverage-observers', name)))
  assert.equal(canonicalJson(manifest.generatedHost), canonicalJson(generated), 'Batch generated single-process host differs')
}

/** The SDK replacement is confined to the selected tenth layer. Its host module
 * projection and complete patch postimages are independently derived, not trusted
 * because a build receipt claims its tests passed. */
export function validateCallerKnownSDK(manifest: Record<string, unknown>): { module: string; version: string; sum: string; source: string } {
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'infra/adapters/storage-caller-known-inputs/patch.lock.json'), 'utf8'))
  const pin = lock.sdkPatch, actual = manifest.sdkReplacement as any
  assert.ok(actual && typeof actual.source === 'string' && path.isAbsolute(actual.source) && !/[\r\n\t ]/.test(actual.source), 'Invalid SDK replacement source')
  assert.ok(typeof manifest.replacementModule === 'string' && path.isAbsolute(manifest.replacementModule) && !/[\r\n\t ]/.test(manifest.replacementModule), 'Invalid toolbox replacement source')
  assert.notEqual(actual.source, manifest.replacementModule)
  assert.equal(canonicalJson(actual), canonicalJson({ module: pin.module, version: pin.version, sum: pin.sum, source: actual.source, patchSha256: pin.patchSha256, postimages: Object.fromEntries(Object.entries(pin.files as Record<string, { after: string }>).map(([name, hashes]) => [name, hashes.after])) }), 'SDK replacement differs from source lock')
  const modules = manifest.generatedModuleFiles as Record<string, unknown>
  assert.deepEqual(Object.keys(modules).sort(), ['hostMod', 'hostSum', 'toolboxMod', 'toolboxSum'].sort())
  for (const value of Object.values(modules)) assert.match(String(value), /^[a-f0-9]{64}$/)
  const hostMod = fs.readFileSync(path.join(root, 'synthesis/go/go.mod'), 'utf8') + `\nreplace ${lock.module} => ${manifest.replacementModule}\n\nreplace ${pin.module} => ${actual.source}\n`
  assert.equal(modules.hostMod, digest(hostMod), 'Generated host module replacements differ')
  assert.equal(modules.hostSum, digest(fs.readFileSync(path.join(root, 'synthesis/go/go.sum'))), 'Generated host checksum file differs')
  const projection = JSON.parse(fs.readFileSync(path.join(root, 'infra/adapters/storage-caller-known-inputs/module-projection.json'), 'utf8'))
  assert.equal(projection.schema, 'tpnil-caller-known-input-module-projection@1.0.0')
  assert.equal(projection.module, lock.module); assert.equal(projection.version, lock.version); assert.equal(projection.sum, lock.sum)
  assert.equal(projection.goMod.path, 'infra/adapters/storage-caller-known-inputs/upstream-toolbox.go.mod')
  const upstreamMod = fs.readFileSync(path.join(root, projection.goMod.path), 'utf8')
  assert.equal(digest(upstreamMod), projection.goMod.sha256)
  assert.equal(modules.toolboxMod, digest(upstreamMod + `\nreplace ${pin.module} => ${actual.source}\n`), 'Generated toolbox test module differs from checksum-bound released source')
  assert.equal(modules.toolboxSum, projection.goSumSha256, 'Generated toolbox checksum file differs from released source')
  return actual
}
