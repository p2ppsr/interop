import fs from 'node:fs'
import {gunzipSync} from 'node:zlib'
import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {decodeCoverageObservation,coverageObservationEncoding} from '../source13-replay/source/synthesis/src/wallet-lab/native/coverage-observation.js'
import {evaluateTransactionBranches} from '../source13-replay/source/synthesis/src/wallet-lab/native/coverage-completion/transaction-branches-parent.js'
const source='38d06bfe2de7e3c1cfbb26b9848052d301b85905',sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex')
const name='synthesis/src/wallet-lab/native/coverage-completion/transaction-branches-verifier.ts',bytes=fs.readFileSync('out/source13-replay/source/'+name)
if(sha(bytes)!==sha(execFileSync('git',['show',source+':'+name])))throw Error('Frozen old classifier differs')
const report=decodeCoverageObservation<any>(JSON.parse(gunzipSync(fs.readFileSync('synthesis/test/fixtures/native-transaction-failure-classification/report.json.gz')).toString()),coverageObservationEncoding)
const checked=await evaluateTransactionBranches(report),stale=checked.outcomes.find((x:any)=>x.id==='transaction.nosend-change/unsigned-stale-txid')!
if(stale.result!=='BLOCKED'||stale.localChecks!=='UNAVAILABLE')throw Error('Old classifier defect not reproduced')
const result={source,verifierSha256:sha(bytes),nativeSessions:0,nativeQualification:false,claim:'LAB_SELF_TEST_ONLY',checked}
fs.writeFileSync('out/source14-preflight/before-correction.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({source,stale:stale.result,nativeQualification:false}))
