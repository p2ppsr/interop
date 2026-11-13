import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {verifyNativePermissionCoverage} from '../../synthesis/src/wallet-lab/native/verify-conformance-permission-coverage.ts'
import {permissionCoverageEvidenceForCompletion} from '../../synthesis/src/wallet-lab/native/completion-profile.ts'
import {deriveTransactionCoverageOutcomes} from '../../synthesis/src/wallet-lab/native/coverage-transactions-verifier.ts'
import {getTransactionCoveragePolicy} from '../../synthesis/src/wallet-lab/native/coverage-transactions-model.ts'
const sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex'),rows=[]
for(const repetition of [1,2]) {
 const base=`out/source10-native-intake/original/repetition-${repetition}/evidence`,read=(name:string)=>fs.readFileSync(path.join(base,name))
 const permission=JSON.parse(read('conformance/permission-coverage.json').toString())
 const result=await verifyNativePermissionCoverage(permission,permissionCoverageEvidenceForCompletion(read,'ITCVE-1@4.8.0'),permission.identity,{profile:'ITCVE-1@4.8.0'})
 const original=read('conformance/coverage-transactions-observed.json'),report=JSON.parse(original.toString()),oldOracle=report.oracle
 report.oracle='tpnil-native-coverage-transactions-oracle@4.0.0'
 const selection=getTransactionCoveragePolicy(4)
 report.policySha256=selection.policySha256
 report.schema='tpnil-native-coverage-transactions@4.0.0'
 const transaction=await deriveTransactionCoverageOutcomes(report)
 assert.equal(sha(read('conformance/coverage-transactions-observed.json')),sha(original))
 rows.push({repetition,permission:{verified:result.verified,assertions:result.assertions.length,result:result.result},transactions:{originalOracle:oldOracle,prospectiveOracle:report.oracle,originalBytesUnchanged:true,originalSha256:sha(original),outcomes:transaction}})
}
fs.writeFileSync('out/source11-intake/native13-prospective-diagnosis.json',JSON.stringify({claim:'LAB_PROSPECTIVE_DIAGNOSIS_ONLY',nativeQualification:false,originalSource:'b83489c2d5c2763cd9d7c958756dd0cb47686a51',run:43330313975,rows},null,2)+'\n')
console.log(JSON.stringify(rows.map(row=>({repetition:row.repetition,permission:row.permission,transactions:row.transactions.outcomes.reduce((a:any,b:any)=>(a[b.result]=(a[b.result]??0)+1,a),{}),nonpass:row.transactions.outcomes.filter((x:any)=>x.result!=='PASS')}))))
