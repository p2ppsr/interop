import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { prepareFrozenComponentReplay } from '../../scripts/frozen-component-replay.mjs'
const root=fs.realpathSync(process.cwd()),source='585211c193d0288effeb466bda38fe6ef23ac94d',directory=path.join(root,'out/native-review-43157437280/source')
assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),source)
const snapshot=prepareFrozenComponentReplay(root,source,directory)
assert.equal(snapshot.root,fs.realpathSync(snapshot.root))
fs.writeFileSync(path.join(root,'out/native-review-43157437280/snapshot.json'),JSON.stringify({...snapshot,preparedAt:new Date().toISOString(),node:process.version},null,2)+'\n',{flag:'wx'})
console.log(JSON.stringify({verified:true,...snapshot}))
