// LAB_SELF_TEST_ONLY prospective score-order projection; no qualification is emitted.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict'
import {canonicalPortabilityAssertions} from '../../synthesis/src/wallet-lab/native/conformance-portability.js'
import {verifyNativeConformance} from '../../synthesis/src/wallet-lab/native/verify-conformance.js'
import {withNativeProofResources} from '../../synthesis/src/wallet-lab/native/proof-resources.js'
const plan=JSON.parse(fs.readFileSync('infra/native/conformance/plan-pr368-coverage-6-source-5.json','utf8')),results:any[]=[]
for(const repetition of[1,2])await withNativeProofResources('ITCVE-1@4.8.0',async()=>{
 const original=path.resolve(`out/source15-native-intake/original/repetition-${repetition}/evidence`),copy=path.resolve(`out/source16-preflight/terminal-repetition-${repetition}`);assert.ok(!fs.existsSync(copy));fs.mkdirSync(copy)
 // This read-only overlay changes only the two prospective score arrays. All
 // original artifacts stay untouched; no host/source or native admission is claimed.
 for(const name of fs.readdirSync(original)){if(name==='conformance')continue;fs.symlinkSync(path.join(original,name),path.join(copy,name))}
 fs.mkdirSync(path.join(copy,'conformance'));for(const name of fs.readdirSync(path.join(original,'conformance'))){if(['portability.json','result.json'].includes(name))continue;fs.symlinkSync(path.join(original,'conformance',name),path.join(copy,'conformance',name))}
 const read=(n:string)=>JSON.parse(fs.readFileSync(path.join(original,n),'utf8')),portable=read('conformance/portability.json'),report=read('conformance/result.json');const before=portable.assertions.map((x:any)=>x.id)
 portable.assertions=canonicalPortabilityAssertions(portable.assertions);report.vectors[6].assertions=canonicalPortabilityAssertions(report.vectors[6].assertions)
 fs.writeFileSync(path.join(copy,'conformance/portability.json'),JSON.stringify(portable));fs.writeFileSync(path.join(copy,'conformance/result.json'),JSON.stringify(report))
 const checked=await verifyNativeConformance(copy,read('conformance/baseline-vectors.json'),plan.lifecycleOracle,plan.portabilityOracle,plan.clauseOracle,plan.itcve)
 results.push({repetition,claim:'LAB_SELF_TEST_ONLY',nativeQualification:false,originalBytesModified:false,prospectiveMembers:['conformance/portability.json','conformance/result.json'],before,after:portable.assertions.map((x:any)=>x.id),verified:checked.verified,observations:checked.vectors.reduce((n:any,v:any)=>n+v.assertions.length,0),counts:Object.fromEntries(['PASS','FAIL','BLOCKED'].map(o=>[o,checked.vectors.flatMap((v:any)=>v.assertions).filter((a:any)=>a.outcome===o).length])),semanticProjection:checked.semanticProjection});fs.writeFileSync('out/source16-preflight/terminal-replay.json',JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify({...results.at(-1),semanticProjection:'RETAINED_IN_JSON'}))
})
