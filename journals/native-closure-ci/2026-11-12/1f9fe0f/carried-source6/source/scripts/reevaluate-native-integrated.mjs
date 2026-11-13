import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { extractZipSafely } from './verify-published-integrations.mjs'
import { evaluateNativeReevaluation, validateReevaluationPlan, sha256, inventory } from './native-reevaluation.mjs'
const root=path.resolve(import.meta.dirname,'..'),[planFile,destination,...extra]=process.argv.slice(2)
assert.ok(planFile&&destination&&extra.length===0,'Usage: reevaluate-native-integrated.mjs PLAN OUTPUT')
const planBytes=fs.readFileSync(path.resolve(planFile)),plan=JSON.parse(planBytes),output=path.resolve(destination),planPath=path.relative(root,path.resolve(planFile)).split(path.sep).join('/')
assert.ok(!planPath.startsWith('../')&&!path.isAbsolute(planPath));assert.equal(sha256(planBytes),sha256(Buffer.from(JSON.stringify(plan,null,2)+'\n')))
validateReevaluationPlan(plan,root);assert.ok(!fs.existsSync(output),'Re-evaluation requires fresh output')
assert.equal(execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim(),'','Re-evaluation requires clean source')
const evaluatorSource=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),zip=fs.readFileSync(path.join(root,plan.original.archive))
assert.deepEqual(execFileSync('git',['show',`${evaluatorSource}:${planPath}`],{cwd:root}),planBytes)
assert.equal(zip.length,plan.original.size);assert.equal(sha256(zip),plan.original.sha256)
fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'original-native.zip'),zip,{flag:'wx'});fs.mkdirSync(path.join(output,'original'));extractZipSafely(zip,path.join(output,'original'))
fs.writeFileSync(path.join(output,'run-lock.json'),JSON.stringify({schema:'tpnil-native-integrated-reevaluation-run-lock@1',planPath,plan,planSha256:sha256(Buffer.from(JSON.stringify(plan,null,2)+'\n')),evaluatorSource,sourceDirty:false},null,2)+'\n',{flag:'wx'})
const result=evaluateNativeReevaluation({root,output,produce:true})
fs.writeFileSync(path.join(output,'reevaluation.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'})
fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify({schema:'tpnil-native-reevaluation-inventory@1',files:inventory(output)},null,2)+'\n',{flag:'wx'})
console.log(JSON.stringify(result))
