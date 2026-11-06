#!/usr/bin/env node
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../', import.meta.url))
const source = new URL('../integrations/services/src/verify.ts', import.meta.url).href
const child = spawn(process.execPath, ['--import', path.join(root, 'integrations/services/node_modules/tsx/dist/loader.mjs'), '--input-type=module', '-e', `import { verifyServicesResult } from ${JSON.stringify(source)}; console.log(JSON.stringify(await verifyServicesResult(process.argv[1])))`, path.resolve(process.argv[2])], { stdio: 'inherit', cwd: root })
child.once('exit', code => { process.exitCode = code ?? 1 })
child.once('error', error => { console.error(error); process.exitCode = 1 })
