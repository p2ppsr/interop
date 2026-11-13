import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const moduleRoot = path.join(root, 'synthesis/go');
const lockPath = path.join(root, 'infra/adapters/storage-list-actions/patch.lock.json');
const lock = JSON.parse(fs.readFileSync(lockPath));
const components = JSON.parse(fs.readFileSync(path.join(moduleRoot, 'components.lock.json')));
const env = { ...process.env, GOTOOLCHAIN: components.toolchain };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const go = (args, cwd = moduleRoot) => execFileSync('go', args, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
const upstream = JSON.parse(go(['mod', 'download', '-json', `${lock.module}@${lock.version}`]));
if (upstream.Sum !== lock.sum) throw new Error('Upstream module checksum mismatch');
const source = path.join(root, 'out/storage-list-actions-go-source');
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
function applyLock(current, currentPath, seen = new Set()) {
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
  const patch = fs.readFileSync(path.join(path.dirname(currentPath), current.patch));
  if (hash(patch) !== current.patchSha256) throw new Error('Patch digest mismatch');
  execFileSync('git', ['apply', '--no-index', '--whitespace=error', '-'], { cwd: source, input: patch, stdio: ['pipe', 'inherit', 'inherit'] });
  for (const [name, hashes] of Object.entries(current.files))
    if (hash(fs.readFileSync(path.join(source, name))) !== hashes.after) throw new Error(`Patch output differs: ${name}`);
}
applyLock(lock, lockPath);
const modfile = path.join(root, 'out/storage-list-actions-go.mod');
fs.copyFileSync(path.join(moduleRoot, 'go.mod'), modfile);
fs.copyFileSync(path.join(moduleRoot, 'go.sum'), modfile.replace(/\.mod$/, '.sum'));
go(['mod', 'edit', `-modfile=${modfile}`, `-replace=${lock.module}=${source}`]);
process.stdout.write(go(['test', `-modfile=${modfile}`, '-mod=readonly', './...']));
process.stdout.write(go(['test', './pkg/storage', '-run', 'Sync|BRC40', '-count=1'], source));
process.stdout.write(go(['test', './pkg/wdk', './pkg/storage/internal/actions', '-count=1'], source));
const binary = path.join(root, 'out/itcve-go-storage-list-actions');
go(['build', `-modfile=${modfile}`, '-mod=readonly', '-trimpath', '-o', binary, './cmd/itcve-services']);
const manifest = { schema: 'tpnil-storage-list-actions-go-build@1.0.0', patchLockSha256: hash(fs.readFileSync(lockPath)), parentPatchLockSha256: lock.parentSha256, patchSha256: lock.patchSha256, upstream: { module: lock.module, version: lock.version, sum: lock.sum }, replacementModule: source, toolchain: components.toolchain, binarySha256: hash(fs.readFileSync(binary)) };
fs.writeFileSync(`${binary}.json`, JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify(manifest, null, 2));
