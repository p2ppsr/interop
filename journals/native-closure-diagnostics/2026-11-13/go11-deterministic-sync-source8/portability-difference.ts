// LAB_SELF_TEST_ONLY: diagnose original native19; never modify captures.
import fs from 'node:fs';import {createHash}from'node:crypto';import{projectDatasetWithReferenceOnlyRows as project}from'../../synthesis/src/storage-sync/projection-reference-rows.js';import{canonicalJson}from'../../synthesis/src/determinism.js'
const hash=(v:unknown)=>createHash('sha256').update(canonicalJson(v)).digest('hex');const results:any[]=[]
for(const i of[1,2]){
 const report=JSON.parse(fs.readFileSync(`out/source17-native-intake/original/repetition-${i}/evidence/conformance/portability.json`,'utf8')),a:any=project(report.source),b:any=project(report.destination),differences:any[]=[]
 function walk(a:any,b:any,p:string){
  if(canonicalJson(a??null)===canonicalJson(b??null))return
  if(a&&b&&typeof a==='object'&&typeof b==='object'&&Array.isArray(a)===Array.isArray(b)){
   for(const k of new Set([...Object.keys(a),...Object.keys(b)]))walk(a[k],b[k],`${p}.${k}`)
  }else differences.push({path:p,source:typeof a==='object'?{hash:hash(a)}:a,destination:typeof b==='object'?{hash:hash(b)}:b})
 }
 walk(a,b,'dataset');const entry={repetition:i,sourceHash:hash(a),destinationHash:hash(b),differences,proofClosureError:report.proofClosureError??null,readWindows:report.readWindows};results.push(entry)
}
fs.writeFileSync('out/source18-preflight/portability-difference.json',JSON.stringify({claim:'LAB_SELF_TEST_ONLY',originalRun:43411602601,nativeQualification:false,results},null,2)+'\n');console.log(JSON.stringify(results,null,2))
