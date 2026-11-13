import fs from 'node:fs';import path from 'node:path';import {evaluatePermissionExtension} from '../../synthesis/src/wallet-lab/native/coverage-permissions-verifier.js'
const rows=[]
for(const repetition of[1,2]){
 const home=path.resolve(`out/source14-native-intake/original/repetition-${repetition}/evidence`),read=(n:string)=>fs.readFileSync(path.join(home,n)),json=(n:string)=>JSON.parse(read(n).toString())
 const r=json('conformance/permission-extension.json'),anchor=json('conformance/permission-coverage.json'),checked=await evaluatePermissionExtension(r,anchor,read,r.identity)
 rows.push({repetition,producer:r.result,assertions:checked})
}
fs.writeFileSync('out/source15-preflight/permission-replay.json',JSON.stringify(rows,null,2)+'\n');console.log(JSON.stringify(rows.map(r=>({repetition:r.repetition,producer:r.producer,first:r.assertions[0]}))))
