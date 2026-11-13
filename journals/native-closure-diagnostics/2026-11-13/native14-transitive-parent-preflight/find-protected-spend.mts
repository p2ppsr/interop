import fs from 'node:fs'
import {Transaction} from '../../synthesis/node_modules/@bsv/sdk/dist/esm/mod.js'
const base='out/source11-native-intake/original/repetition-1/evidence/',read=(n:string)=>JSON.parse(fs.readFileSync(base+n,'utf8')),r=read('conformance/coverage-transactions.json'),op=r.trace.find((r:any)=>r.id==='change-foreign').args.options.noSendChange[0],hits=[]
for(const v of read('native-transactions.json')){const tx=Transaction.fromHex(v.rawTxHex);if(tx.inputs.some(i=>`${i.sourceTXID}.${i.sourceOutputIndex}`===op))hits.push(v.txid)}
console.log({op,hits})
for(const name of fs.readdirSync(base+'conformance').filter(n=>n.endsWith('.json'))){const raw=read('conformance/'+name),v=raw.value??raw;for(const row of v.trace??[])if(hits.includes(row.result?.txid))console.log({file:name,id:row.id,actor:row.actor,method:row.method})}
