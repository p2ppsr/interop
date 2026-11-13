import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const moduleRoot = path.join(root, 'synthesis/go');
const lockPath = path.join(root, 'infra/adapters/storage-merge-accounting/patch.lock.json');
const lockBytes = fs.readFileSync(lockPath);
const lock = JSON.parse(lockBytes);
const components = JSON.parse(fs.readFileSync(path.join(moduleRoot, 'components.lock.json')));
const env = { ...process.env, GOTOOLCHAIN: components.toolchain,
  TPNIL_NODE: process.execPath, TPNIL_TS_NATIVE_CONTRACT_TEST: path.join(root, 'infra/adapters/storage-native-contracts/rpc-contract-test.mjs') };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const hostSources = fs.readdirSync(moduleRoot, { recursive: true, withFileTypes: true })
  .filter(entry => entry.isFile() && entry.name.endsWith('.go'))
  .map(entry => path.relative(root, path.join(entry.parentPath, entry.name)).split(path.sep).join('/')).sort();
const inputNames = ['scripts/prepare-storage-merge-accounting-go.mjs',
  'infra/adapters/storage-native-contracts/rpc-contract-test.mjs', 'synthesis/package-lock.json',
  'synthesis/go/components.lock.json', 'synthesis/go/go.mod', 'synthesis/go/go.sum', ...hostSources];
const inputs = Object.fromEntries(inputNames.map(name => [name, hash(fs.readFileSync(path.join(root, name)))]));
const go = (args, cwd = moduleRoot) => {
  try { return execFileSync('go', args, { cwd, env, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit'] }); }
  catch (error) { if (error.stdout) process.stdout.write(error.stdout); throw new Error(`Go command failed (${error.status ?? error.code}): ${args.join(' ')}`); }
};
for (const [name, digest] of Object.entries(components.moduleFiles)) if (hash(fs.readFileSync(path.join(moduleRoot, name))) !== digest) throw new Error(`Host module lock differs: ${name}`);
const upstream = JSON.parse(go(['mod', 'download', '-json', `${lock.module}@${lock.version}`]));
if (upstream.Sum !== lock.sum) throw new Error('Upstream module checksum mismatch');
const source = path.join(root, 'out/storage-merge-accounting-go-source');
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
const modfile = path.join(root, 'out/storage-merge-accounting-go.mod');
fs.copyFileSync(path.join(moduleRoot, 'go.mod'), modfile);
fs.copyFileSync(path.join(moduleRoot, 'go.sum'), modfile.replace(/\.mod$/, '.sum'));
go(['mod', 'edit', `-modfile=${modfile}`, `-replace=${lock.module}=${source}`]);
process.stdout.write(go(['test', `-modfile=${modfile}`, '-mod=readonly', './...']));
process.stdout.write(go(['test', './pkg/services', './pkg/internal/txutils', './pkg/internal/storage/funder', './pkg/internal/storage/repo', './pkg/storage', './pkg/wdk', './pkg/storage/internal/actions', './pkg/internal/validate', './pkg/wallet/internal/mapping', '-count=1'], source));
const binary = path.join(root, 'out/itcve-go-storage-merge-accounting');
// Compile one host, preserving the old command sources and their lifecycle.
// The only generated main change is the explicit prospective v2 control route.
const host = path.join(root, 'out/storage-merge-accounting-host');
fs.rmSync(host, { force: true, recursive: true }); fs.mkdirSync(host, { recursive: true });
for (const entry of fs.readdirSync(path.join(moduleRoot, 'cmd/itcve-services'))) {
  if (entry.endsWith('.go') && !entry.endsWith('_test.go')) fs.copyFileSync(path.join(moduleRoot, 'cmd/itcve-services', entry), path.join(host, entry));
}
const mainPath = path.join(host, 'main.go');
const main = fs.readFileSync(mainPath, 'utf8');
const anchor = '\t\tmux.Handle("GET /control/action-references", actionReferencesHandler(provider.Database.DB, *token))';
if (main.split(anchor).length !== 2) throw new Error('Prospective host route injection anchor changed');
fs.writeFileSync(mainPath, main.replace(anchor, anchor + '\n\t\tmux.Handle("GET /control/v2/native-output-snapshot", nativeOutputSnapshotHandler(provider.Database.DB, *token))'));
fs.copyFileSync(path.join(moduleRoot, 'cmd/itcve-services-batch-subjects/native_output_snapshot.go'), path.join(host, 'native_output_snapshot.go'));
const generatedHost = Object.fromEntries(fs.readdirSync(host).sort().map(name => [name, hash(fs.readFileSync(path.join(host, name)))]));
const hostFiles = Object.keys(generatedHost).map(name => path.join(host, name));
go(['build', `-modfile=${modfile}`, '-mod=readonly', '-trimpath', '-o', binary, ...hostFiles]);
for (const [name, digest] of Object.entries({ ...inputs, ...patchInputs })) if (hash(fs.readFileSync(path.join(root, name))) !== digest) throw new Error(`Build input changed during validation: ${name}`);
const manifest = { schema: 'tpnil-storage-merge-accounting-go-build@1.0.0', patchLockSha256: hash(lockBytes), parentPatchLockSha256: lock.parentSha256, patchSha256: lock.patchSha256, upstream: { module: lock.module, version: lock.version, sum: lock.sum }, replacementModule: source, toolchain: components.toolchain, binarySha256: hash(fs.readFileSync(binary)), generatedHost, patchInputs, validation: { mergedCreditsAndOwnerCAS: 'PASS', dustConservationAndAuthenticatedDebit: 'PASS', batchHTTPAndPreparationSuites: 'PASS', outputSnapshotSuite: 'PASS', claim: 'LAB_SELF_TEST_ONLY', hostSuite: 'PASS', storageSuiteIncludingAuthenticatedTypeScriptRPC: 'PASS', mappingActionsValidationSuites: 'PASS' }, inputs };
fs.writeFileSync(`${binary}.json`, JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify(manifest, null, 2));
