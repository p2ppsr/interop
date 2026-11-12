import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { evaluateNativeReevaluation, inventory } from './native-reevaluation.mjs'
export function verifyNativeReevaluation(output,{root=path.resolve(import.meta.dirname,'..')}={}) {
  const manifest=JSON.parse(fs.readFileSync(path.join(output,'manifest.json'),'utf8'))
  assert.equal(manifest.schema,'tpnil-native-reevaluation-inventory@1')
  assert.deepEqual(inventory(output).filter(row=>row.path!=='manifest.json'),manifest.files)
  const expected=evaluateNativeReevaluation({root,output}),observed=JSON.parse(fs.readFileSync(path.join(output,'reevaluation.json'),'utf8'))
  assert.deepEqual(observed,expected,'Re-evaluation result does not independently reproduce')
  return {verified:true,claim:observed.claim,originalNativeSource:observed.original.source,evaluatorSource:observed.evaluatorSource,newNativeSessions:0,nativeOutcome:observed.nativeOutcome,integrationOutcome:observed.integrationOutcome,rustOutcome:observed.rustOutcome,repetitions:2}
}
if(process.argv[1]&&path.resolve(process.argv[1])===import.meta.filename){assert.equal(process.argv.length,3);console.log(JSON.stringify(verifyNativeReevaluation(path.resolve(process.argv[2]))))}
