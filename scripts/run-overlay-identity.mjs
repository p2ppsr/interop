#!/usr/bin/env node
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../', import.meta.url))
const child = spawn(process.execPath, ['--import', path.join(root, 'integrations/services/node_modules/tsx/dist/loader.mjs'), path.join(root, 'integrations/services/src/qualification.ts'), ...process.argv.slice(2)], { stdio: 'inherit', cwd: root, env: process.env })
child.once('exit', (code, signal) => { if (signal) process.kill(process.pid, signal); else process.exitCode = code ?? 1 })
child.once('error', error => { console.error(error); process.exitCode = 1 })
