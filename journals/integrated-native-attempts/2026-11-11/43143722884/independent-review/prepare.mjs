import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { prepareFrozenComponentReplay } from '../../scripts/frozen-component-replay.mjs'
const root=fs.realpathSync(process.cwd()),source='6b174e0b903225923999a44fb1de7d67cc4e2959',directory=path.join(root,'out/native-review-43143722884/source')
assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),source)
const snapshot=prepareFrozenComponentReplay(root,source,directory)
assert.equal(snapshot.root,fs.realpathSync(snapshot.root))
fs.writeFileSync(path.join(root,'out/native-review-43143722884/snapshot.json'),JSON.stringify({...snapshot,preparedAt:new Date().toISOString(),node:process.version},null,2)+'\n',{flag:'wx'})
console.log(JSON.stringify({verified:true,...snapshot}))
