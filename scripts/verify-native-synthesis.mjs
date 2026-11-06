#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import path from 'node:path'
const root = path.resolve(import.meta.dirname, '..')
const child = spawnSync(process.execPath, ['--import', path.join(root, 'synthesis/node_modules/tsx/dist/loader.mjs'), path.join(root, 'synthesis/src/wallet-lab/native/verify-synthesis.ts'), ...process.argv.slice(2)], { stdio: 'inherit' })
if (child.error) throw child.error
process.exitCode = child.status ?? 1
