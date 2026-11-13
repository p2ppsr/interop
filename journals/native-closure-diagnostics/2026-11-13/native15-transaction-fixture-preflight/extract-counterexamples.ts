import fs from 'node:fs'
import path from 'node:path'
import {decodeCoverageObservation,encodeCoverageObservation,coverageObservationEncoding} from '../../synthesis/src/wallet-lab/native/coverage-observation.js'
const root=path.resolve(import.meta.dirname,'../..')
for(const repetition of[1,2]){
 const source=`out/source12-native-intake/original/repetition-${repetition}/evidence/conformance/transaction-branches-observed.json`
 const r=decodeCoverageObservation<any>(JSON.parse(fs.readFileSync(path.join(root,source),'utf8')),coverageObservationEncoding)
 const call=(id:string)=>r.trace.find((x:any)=>x.id===id)
 const signed=call('full-child-sign').result.txid
 const example={claim:'ENGINEERING_COUNTEREXAMPLE_ONLY',nativeQualification:false,sourceRun:43358474345,repetition,source,recipientScript:r.recipientScript,fixture:JSON.parse(fs.readFileSync(path.join(root,'fixtures/teranode/wab-funding-v1.json'),'utf8')),fullSet:r.fullSet,stage:call('full-child-stage'),sign:call('full-child-sign'),outputs:r.cuts.find((x:any)=>x.id==='full-set-after').snapshot.providers.flatMap((x:any)=>x.snapshot.outputs).filter((x:any)=>x.txid===signed)}
 fs.writeFileSync(path.join(import.meta.dirname,`native15-no-change-${repetition}.json`),JSON.stringify(encodeCoverageObservation(example))+'\n')
}
