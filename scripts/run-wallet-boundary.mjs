import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
if (!process.argv[2]) throw new Error('Usage: run-wallet-boundary.mjs OUTPUT typescript|go');
const result = spawnSync(process.execPath, ['--import', path.join(root, 'synthesis/node_modules/tsx/dist/loader.mjs'), path.join(root, 'synthesis/src/wallet-lab/run-boundary.ts'), path.resolve(process.argv[2]), process.argv[3] ?? 'typescript'], { cwd: root, stdio: 'inherit', timeout: 240_000 });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
