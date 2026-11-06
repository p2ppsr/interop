import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const output = path.resolve(process.argv[2] ?? path.join(root, 'out/storage-sync'));
if (fs.existsSync(path.join(output, 'result.json'))) throw new Error('Output contains an immutable run; choose a new directory');
fs.mkdirSync(output, { recursive: true });
const digest = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sourceRevision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const inputs = ['scripts/run-storage-sync.mjs', 'scripts/prepare-storage-sync-go.mjs', 'synthesis/go/cmd/itcve-services/main.go', 'synthesis/go/cmd/itcve-services/sync.go', 'out/itcve-go-storage-sync', 'out/itcve-go-storage-sync.json', 'infra/adapters/storage-sync/go-wallet-toolbox-v0.191.4.patch', 'synthesis/src/storage-sync/verify.ts', 'synthesis/src/storage-sync/run.ts', 'synthesis/src/storage-sync/projection.ts', 'synthesis/src/storage-sync/compatibility.ts', 'synthesis/src/storage-sync/fixture-wallet.ts', 'synthesis/src/wallet-lab/services.ts', 'synthesis/src/wallet-lab/go-services.ts', 'synthesis/package-lock.json', 'infra/adapters/storage-sync/patch.lock.json', 'programs/ISI-3/profiles/storage-http-sync-1.0.0/README.md', 'fixtures/teranode/wab-funding-v1.json'];
const frozenInputs = Object.fromEntries(inputs.map(name => [name, digest(path.join(root, name))]));
fs.writeFileSync(path.join(output, 'inputs.json'), JSON.stringify({ sourceRevision, files: frozenInputs }, null, 2) + '\n');
const runs = [];
for (const source of ['typescript', 'go']) for (const destination of ['typescript', 'go']) for (let repetition = 1; repetition <= 2; repetition++) {
  const name = `${source}-to-${destination}-${repetition}`;
  const directory = path.join(output, name);
  fs.mkdirSync(directory, { recursive: true });
  const fd = fs.openSync(path.join(directory, 'runner.log'), 'wx');
  const child = spawnSync(process.execPath, ['--import', path.join(root, 'synthesis/node_modules/tsx/dist/loader.mjs'), path.join(root, 'synthesis/src/storage-sync/run.ts'), source, destination, directory], { cwd: root, env: { ...process.env, TPNIL_STORAGE_SYNC_PATCH: '1' }, timeout: 180_000, stdio: ['ignore', fd, fd] });
  fs.closeSync(fd);
  if (child.error || child.status !== 0 || !fs.existsSync(path.join(directory, 'result.json'))) throw new Error(`Storage cell ${name} failed its evidence contract: ${child.error ?? child.status}`);
  const result = JSON.parse(fs.readFileSync(path.join(directory, 'result.json')));
  for (const evidence of result.evidence) if (digest(path.join(directory, evidence.path)) !== evidence.sha256) throw new Error(`Evidence digest mismatch: ${name}/${evidence.path}`);
  runs.push({ name, ...result });
  console.log(`${name}: ${result.result}`);
}
for (const name of inputs) if (digest(path.join(root, name)) !== frozenInputs[name]) throw new Error(`Frozen input changed during matrix: ${name}`);
const repeatability = [];
for (let i = 0; i < runs.length; i += 2) {
  const semantic = run => run.assertions.map(({ id, result }) => ({ id, result })).sort((a,b) => a.id.localeCompare(b.id));
  repeatability.push({ components: runs[i].components, matches: JSON.stringify(semantic(runs[i])) === JSON.stringify(semantic(runs[i + 1])) });
}
const result = { schema: 'tpnil-storage-sync-matrix@1.0.0', claim: 'INFRASTRUCTURE_QUALIFICATION_ONLY', sourceRevision, frozenInputs, runs: runs.map(({name,result,cleanup,assertions,components}) => ({name,result,cleanup,assertions,components})), repeatability, result: runs.every(run => run.result === 'PASS' && run.cleanup) && repeatability.every(item => item.matches) ? 'PASS' : 'FAIL' };
fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2) + '\n');
console.log(`Storage matrix: ${result.result}; ${runs.length} runs retained in ${output}`);
