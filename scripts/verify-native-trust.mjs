import path from 'node:path';
import { spawnSync } from 'node:child_process';
const root = path.resolve(import.meta.dirname, '..');
if (!process.argv[2]) throw new Error('Usage: verify-native-trust.mjs INTEGRATED_EVIDENCE_DIRECTORY');
const child = spawnSync(process.execPath, ['--import', path.join(root, 'synthesis/node_modules/tsx/dist/loader.mjs'), path.join(root, 'synthesis/src/wallet-lab/native/verify-identity-trust.ts'), path.resolve(process.argv[2])], { cwd: root, stdio: 'inherit' });
if (child.error) throw child.error;
process.exitCode = child.status ?? 1;
