// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
if (outIndex >= 0 && !args[outIndex + 1]) throw new Error('--out requires a directory');
const output = path.resolve(outIndex >= 0 ? args[outIndex + 1] : path.join(root, 'out/messaging'));
if (fs.existsSync(path.join(output, 'result.json'))) throw new Error('Output already contains evidence; use a new attempt directory');
const pathsFile = path.join(root, 'out/messaging-sources/paths.json');
if (!fs.existsSync(pathsFile)) throw new Error('Run node scripts/prepare-messaging.mjs first');
const { verifyMessagingBuild } = await import('../components/messaging/identity.mjs');
const paths = JSON.parse(fs.readFileSync(pathsFile));
verifyMessagingBuild(root, paths);
const result = spawnSync(process.execPath, ['--import', path.join(paths['typescript-messagebox'], 'node_modules/tsx/dist/loader.mjs'), path.join(root, 'components/messaging/run.mjs'), output], { cwd: root, stdio: 'inherit', env: { ...process.env, TPNIL_MESSAGING_PATHS: pathsFile } });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
