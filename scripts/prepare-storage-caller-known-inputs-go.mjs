import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const moduleRoot = path.join(root, 'synthesis/go');
const lockPath = path.join(root, 'infra/adapters/storage-caller-known-inputs/patch.lock.json');
const lockBytes = fs.readFileSync(lockPath);
const lock = JSON.parse(lockBytes);
const components = JSON.parse(fs.readFileSync(path.join(moduleRoot, 'components.lock.json')));
const env = { ...process.env, GOTOOLCHAIN: components.toolchain,
  TPNIL_NODE: process.execPath, TPNIL_TS_NATIVE_CONTRACT_TEST: path.join(root, 'infra/adapters/storage-native-contracts/rpc-contract-test.mjs') };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const collectHostSources = () => fs.readdirSync(moduleRoot, { recursive: true, withFileTypes: true })
  .filter(entry => entry.isFile() && entry.name.endsWith('.go'))
  .map(entry => path.relative(root, path.join(entry.parentPath, entry.name)).split(path.sep).join('/')).sort();
const hostSources = collectHostSources();
const inputNames = ['scripts/prepare-storage-caller-known-inputs-go.mjs',
  'infra/adapters/storage-native-contracts/rpc-contract-test.mjs', 'synthesis/package-lock.json',
  'infra/adapters/storage-caller-known-inputs/LICENSE-sdk', 'infra/adapters/storage-caller-known-inputs/LICENSE-toolbox',
  'infra/adapters/storage-caller-known-inputs/upstream-toolbox.go.mod', 'infra/adapters/storage-caller-known-inputs/module-projection.json',
  'synthesis/go/components.lock.json', 'synthesis/go/go.mod', 'synthesis/go/go.sum', ...hostSources];
const inputs = Object.fromEntries(inputNames.map(name => [name, hash(fs.readFileSync(path.join(root, name)))]));
const go = (args, cwd = moduleRoot) => {
  try { return execFileSync('go', args, { cwd, env, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit'] }); }
  catch (error) { if (error.stdout) process.stdout.write(error.stdout); throw new Error(`Go command failed (${error.status ?? error.code}): ${args.join(' ')}`); }
};
for (const [name, digest] of Object.entries(components.moduleFiles)) if (hash(fs.readFileSync(path.join(moduleRoot, name))) !== digest) throw new Error(`Host module lock differs: ${name}`);
const upstream = JSON.parse(go(['mod', 'download', '-json', `${lock.module}@${lock.version}`]));
if (upstream.Sum !== lock.sum) throw new Error('Upstream module checksum mismatch');
const moduleProjection = JSON.parse(fs.readFileSync(path.join(root, 'infra/adapters/storage-caller-known-inputs/module-projection.json')));
if (moduleProjection.schema !== 'tpnil-caller-known-input-module-projection@1.0.0' || moduleProjection.module !== lock.module || moduleProjection.version !== lock.version || moduleProjection.sum !== lock.sum || moduleProjection.goMod?.path !== 'infra/adapters/storage-caller-known-inputs/upstream-toolbox.go.mod') throw new Error('Unexpected toolbox module projection');
if (hash(fs.readFileSync(path.join(upstream.Dir, 'go.mod'))) !== moduleProjection.goMod.sha256 || hash(fs.readFileSync(path.join(root, moduleProjection.goMod.path))) !== moduleProjection.goMod.sha256 || hash(fs.readFileSync(path.join(upstream.Dir, 'go.sum'))) !== moduleProjection.goSumSha256) throw new Error('Toolbox module projection differs from released source');
const source = path.join(root, 'out/storage-caller-known-inputs-go-source');
function writable(directory) {
  if (!fs.existsSync(directory)) return;
  fs.chmodSync(directory, 0o755);
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, item.name);
    if (item.isDirectory()) writable(target); else if (item.isFile()) fs.chmodSync(target, 0o644);
  }
}
writable(source);
fs.rmSync(source, { force: true, recursive: true });
fs.cpSync(upstream.Dir, source, { recursive: true });
writable(source);
// Reconstruct the complete immutable patch chain from the released module.
// Every parent lock, patch and before/after file digest is checked independently.
const patchInputs = {};
function applyLock(current, currentPath, seen = new Set()) {
  patchInputs[path.relative(root, currentPath).split(path.sep).join('/')] = hash(fs.readFileSync(currentPath));
  if (seen.has(currentPath)) throw new Error('Cyclic compatibility patch chain');
  seen.add(currentPath);
  if (current.module !== lock.module || current.version !== lock.version || current.sum !== lock.sum) throw new Error('Patch ancestry changes upstream identity');
  if (current.parent !== undefined) {
    const parentPath = path.resolve(root, current.parent);
    const parentBytes = fs.readFileSync(parentPath);
    if (hash(parentBytes) !== current.parentSha256) throw new Error('Parent patch lock differs');
    applyLock(JSON.parse(parentBytes), parentPath, seen);
  }
  for (const [name, hashes] of Object.entries(current.files)) {
    const target = path.join(source, name);
    if (hashes.before === null ? fs.existsSync(target) : hash(fs.readFileSync(target)) !== hashes.before) throw new Error(`Patch input differs: ${name}`);
    if (fs.existsSync(target)) fs.chmodSync(target, 0o644);
  }
  const patchPath = path.join(path.dirname(currentPath), current.patch);
  const patch = fs.readFileSync(patchPath);
  patchInputs[path.relative(root, patchPath).split(path.sep).join('/')] = hash(patch);
  if (hash(patch) !== current.patchSha256) throw new Error('Patch digest mismatch');
  execFileSync('git', ['apply', '--no-index', '--whitespace=error', '-'], { cwd: source, input: patch, stdio: ['pipe', 'inherit', 'inherit'] });
  for (const [name, hashes] of Object.entries(current.files))
    if (hash(fs.readFileSync(path.join(source, name))) !== hashes.after) throw new Error(`Patch output differs: ${name}`);
}
applyLock(lock, lockPath);
// The SDK change has its own upstream checksum, pre/postimages and patch digest.
// Its module cache is immutable; every consumer in this host sees the same
// explicitly replaced SDK source through the generated module files.
const sdk = lock.sdkPatch;
if (sdk?.module !== 'github.com/bsv-blockchain/go-sdk' || sdk.version !== 'v1.7.3') throw new Error('Unexpected SDK patch identity');
const sdkUpstream = JSON.parse(go(['mod', 'download', '-json', `${sdk.module}@${sdk.version}`]));
if (sdkUpstream.Sum !== sdk.sum) throw new Error('SDK module checksum mismatch');
const sdkSource = path.join(root, 'out/storage-caller-known-inputs-sdk-source');
writable(sdkSource); fs.rmSync(sdkSource, { force: true, recursive: true });
fs.cpSync(sdkUpstream.Dir, sdkSource, { recursive: true }); writable(sdkSource);
for (const [name, hashes] of Object.entries(sdk.files)) {
  const target = path.join(sdkSource, name);
  if (hashes.before === null ? fs.existsSync(target) : hash(fs.readFileSync(target)) !== hashes.before) throw new Error(`SDK patch input differs: ${name}`);
}
const sdkPatchPath = path.join(path.dirname(lockPath), sdk.patch);
const sdkPatch = fs.readFileSync(sdkPatchPath);
patchInputs[path.relative(root, sdkPatchPath).split(path.sep).join('/')] = hash(sdkPatch);
if (hash(sdkPatch) !== sdk.patchSha256) throw new Error('SDK patch digest mismatch');
execFileSync('git', ['apply', '--no-index', '--whitespace=error', '-'], { cwd: sdkSource, input: sdkPatch, stdio: ['pipe', 'inherit', 'inherit'] });
for (const [name, hashes] of Object.entries(sdk.files)) if (hash(fs.readFileSync(path.join(sdkSource, name))) !== hashes.after) throw new Error(`SDK patch output differs: ${name}`);

const modfile = path.join(root, 'out/storage-caller-known-inputs-go.mod');
fs.copyFileSync(path.join(moduleRoot, 'go.mod'), modfile);
fs.copyFileSync(path.join(moduleRoot, 'go.sum'), modfile.replace(/\.mod$/, '.sum'));
go(['mod', 'edit', `-modfile=${modfile}`, `-replace=${lock.module}=${source}`]);
go(['mod', 'edit', `-modfile=${modfile}`, `-replace=${sdk.module}=${sdkSource}`]);
const toolboxModfile = path.join(root, 'out/storage-caller-known-inputs-toolbox.mod');
fs.copyFileSync(path.join(source, 'go.mod'), toolboxModfile);
fs.copyFileSync(path.join(source, 'go.sum'), toolboxModfile.replace(/\.mod$/, '.sum'));
go(['mod', 'edit', `-modfile=${toolboxModfile}`, `-replace=${sdk.module}=${sdkSource}`], source);
process.stdout.write(go(['test', `-modfile=${modfile}`, '-mod=readonly', './...']));
process.stdout.write(go(['test', `-modfile=${toolboxModfile}`, '-mod=readonly', './pkg/internal/storage/database', './pkg/internal/storage/dbretry', './pkg/services', './pkg/internal/txutils', './pkg/internal/storage/funder', './pkg/internal/storage/repo', './pkg/storage', './pkg/wdk', './pkg/storage/internal/actions', './pkg/internal/validate', './pkg/wallet/internal/mapping', '-count=1'], source));
process.stdout.write(go(['test', './transaction', '-count=1'], sdkSource));
const binary = path.join(root, 'out/itcve-go-storage-caller-known-inputs');
// Compile one host, preserving the old command sources and their lifecycle.
// The explicit coverage observer routes share the existing process and database.
const host = path.join(root, 'out/storage-caller-known-inputs-host');
fs.rmSync(host, { force: true, recursive: true }); fs.mkdirSync(host, { recursive: true });
for (const entry of fs.readdirSync(path.join(moduleRoot, 'cmd/itcve-services'))) {
  if (entry.endsWith('.go') && !entry.endsWith('_test.go')) fs.copyFileSync(path.join(moduleRoot, 'cmd/itcve-services', entry), path.join(host, entry));
}
const mainPath = path.join(host, 'main.go');
let main = fs.readFileSync(mainPath, 'utf8');
const anchor = '\t\tmux.Handle("GET /control/action-references", actionReferencesHandler(provider.Database.DB, *token))';
if (main.split(anchor).length !== 2) throw new Error('Prospective host route injection anchor changed');
main = main.replace(anchor, anchor + '\n\t\tmux.Handle("GET /control/v2/native-output-snapshot", nativeOutputSnapshotHandler(provider.Database.DB, *token))' + '\n\t\tmux.Handle("GET /control/v1/native-certificate-inventory", certificateInventoryHandler(provider.Database.DB, *token))' + '\n\t\tmux.Handle("GET /control/v1/transaction-knowledge-inventory", transactionKnowledgeInventoryHandler(provider.Database.DB, *token))');
fs.copyFileSync(path.join(moduleRoot, 'cmd/itcve-services-batch-subjects/native_output_snapshot.go'), path.join(host, 'native_output_snapshot.go'));
function replaceOnce(before, after) { if (main.split(before).length !== 2) throw new Error(`Action host injection anchor changed: ${before}`); main = main.replace(before, after); }
replaceOnce('func run() error {', 'func run() (runError error) {');
replaceOnce('\t\trpc := storage.NewServer(logger, provider, authWallet, storage.ServerOptions{Monetize: false, DisableCORS: true})', '\t\tactionObserver, err := newActionLedger(provider, provider.Database.DB, db.SQLite.ConnectionString, filepath.Join(*state, "action-query-ledger"), identity)\n\t\tif err != nil { return err }\n\t\tdefer func() { closeContext, done := context.WithTimeout(context.Background(), 10*time.Second); defer done(); runError = errors.Join(runError, actionObserver.Close(closeContext)) }()\n\t\tmux.Handle("GET /control/v1/native-action-query-cuts", actionObserver.ControlHandler(*token))\n\t\trpc := storage.NewServer(logger, actionObserver.provider, authWallet, storage.ServerOptions{Monetize: false, DisableCORS: true})');
replaceOnce('storageBrowserHandler(rpc.Handler())', 'storageBrowserHandler(actionObserver.Handler(rpc.Handler()))');
fs.writeFileSync(mainPath, main);
for (const name of fs.readdirSync(path.join(moduleRoot, 'cmd/itcve-services-coverage-observers')).sort()) if (name.endsWith('.go') && !name.endsWith('_test.go')) fs.copyFileSync(path.join(moduleRoot, 'cmd/itcve-services-coverage-observers', name), path.join(host, name));
const generatedHost = Object.fromEntries(fs.readdirSync(host).sort().map(name => [name, hash(fs.readFileSync(path.join(host, name)))]));
const hostFiles = Object.keys(generatedHost).map(name => path.join(host, name));
go(['build', `-modfile=${modfile}`, '-mod=readonly', '-trimpath', '-o', binary, ...hostFiles]);
for (const [name, digest] of Object.entries({ ...inputs, ...patchInputs })) if (hash(fs.readFileSync(path.join(root, name))) !== digest) throw new Error(`Build input changed during validation: ${name}`);
if (JSON.stringify(collectHostSources()) !== JSON.stringify(hostSources)) throw new Error('Host source inventory changed during validation');
const manifest = { schema: 'tpnil-storage-caller-known-inputs-go-build@1.0.0', patchLockSha256: hash(lockBytes), parentPatchLockSha256: lock.parentSha256, patchSha256: lock.patchSha256, upstream: { module: lock.module, version: lock.version, sum: lock.sum }, replacementModule: source, sdkReplacement: { module: sdk.module, version: sdk.version, sum: sdk.sum, source: sdkSource, patchSha256: sdk.patchSha256, postimages: Object.fromEntries(Object.entries(sdk.files).map(([name, hashes]) => [name, hashes.after])) }, generatedModuleFiles: { hostMod: hash(fs.readFileSync(modfile)), hostSum: hash(fs.readFileSync(modfile.replace(/\.mod$/, '.sum'))), toolboxMod: hash(fs.readFileSync(toolboxModfile)), toolboxSum: hash(fs.readFileSync(toolboxModfile.replace(/\.mod$/, '.sum'))) }, toolchain: components.toolchain, binarySha256: hash(fs.readFileSync(binary)), generatedHost, patchInputs, validation: { callerDeclaredKnownInputs: 'PASS', completeCurrentSpendValidation: 'PASS', suppliedUnmarkedAndExtraneousProofs: 'PASS', legacyCustomVerifierCompatibility: 'PASS', certificateInventory: 'PASS', transactionKnowledgeInventory: 'PASS', actionQueryAuthenticatedRPCLedger: 'PASS', actionQuerySeparateReadOnlyPool: 'PASS', actionQueryCWIJoin: 'UNAVAILABLE', typedSQLiteSnapshotRollbackRetry: 'PASS', callerOwnedInputResponseAncestry: 'PASS', mergedCreditsAndOwnerCAS: 'PASS', dustConservationAndAuthenticatedDebit: 'PASS', batchHTTPAndPreparationSuites: 'PASS', outputSnapshotSuite: 'PASS', claim: 'LAB_SELF_TEST_ONLY', hostSuite: 'PASS', storageSuiteIncludingAuthenticatedTypeScriptRPC: 'PASS', mappingActionsValidationSuites: 'PASS' }, inputs };
fs.writeFileSync(`${binary}.json`, JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify(manifest, null, 2));
