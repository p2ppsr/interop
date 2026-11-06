import { spawnSync } from 'node:child_process'
import path from 'node:path'
const root = path.resolve(import.meta.dirname, '..')
const result = spawnSync(process.execPath, [path.join(root, 'synthesis/node_modules/tsx/dist/cli.mjs'),
  path.join(root, 'synthesis/src/transport-integration.ts'), ...process.argv.slice(2)], { cwd: root, stdio: 'inherit', timeout: 180_000 })
if (result.error) throw result.error
process.exitCode = result.status ?? 1
