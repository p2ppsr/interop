import fs from 'node:fs'
import http from 'node:http'
import { createHash } from 'node:crypto'
const capture = () => { const files: any = {}; const walk = (directory: string) => { for (const name of fs.readdirSync(directory)) { const filename=path.join(directory,name); if(fs.statSync(filename).isDirectory()) walk(filename); else files[filename]=createHash('sha256').update(fs.readFileSync(filename)).digest('hex') } }; walk('synthesis/src'); for (const filename of ['synthesis/package-lock.json', 'programs/ISI-4/profiles/native-conformance-5.0.0/conditional-oracle-1.0.0.json', 'fixtures/teranode/wab-funding-v1.json']) files[filename]=createHash('sha256').update(fs.readFileSync(filename)).digest('hex'); return files }
const before=capture()
fs.writeFileSync('out/conditional-preflight-20261111/source-before-7.json', JSON.stringify(before,null,2)+'\n')
import path from 'node:path'
const nativeFetch=globalThis.fetch
let services:any
// Install before loading SDK: SimplifiedFetchTransport captures defaultFetch.
globalThis.fetch = (async (input:any, init:any) => {
 const url=typeof input==='string'?input:input.toString()
 if (!url.startsWith('https://certifier.itcve.test/')) return nativeFetch(input,init)
 return new Promise((resolve,reject)=>{
  const req=http.request(url.replace('https://certifier.itcve.test',services.serviceUrl),{method:init?.method,headers:{...Object.fromEntries(new Headers(init?.headers)),host:'certifier.itcve.test'}},res=>{
   const chunks:Buffer[]=[];res.on('data',chunk=>chunks.push(Buffer.from(chunk)));res.on('end',()=>resolve(new Response(Buffer.concat(chunks),{status:res.statusCode,headers:res.headers as any})))
  });req.on('error',reject);req.end(init?.body)
 })
}) as typeof fetch
const { ControlledWalletServices } = await import('../../synthesis/src/wallet-lab/services.js')
const { createFixtureWallet } = await import('../../synthesis/src/storage-sync/fixture-wallet.js')
const { EvidenceBundle } = await import('../../synthesis/src/wallet-lab/evidence.js')
const { runNativeConditionalConformance } = await import('../../synthesis/src/wallet-lab/native/conformance-conditional.js')
const { verifyNativeConditionalConformance } = await import('../../synthesis/src/wallet-lab/native/verify-conformance-conditional.js')
const root=process.cwd(),out=path.join(root,'out/conditional-preflight-20261111')
services = new ControlledWalletServices({webroot:out})
let wallet:any
try {
 await services.start()
 await services.fundRemoteWalletFromTeranode('77'.repeat(32),JSON.parse(fs.readFileSync('fixtures/teranode/wab-funding-v1.json','utf8')))
 wallet=await createFixtureWallet(services,'77'.repeat(32))
 const identity=await wallet.getPublicKey({identityKey:true})
 const evidence=new EvidenceBundle(path.join(out,'evidence-7'))
 const report=await runNativeConditionalConformance({wallet,services,evidence,boundaryReport:{trace:[{method:'getPublicKey',args:{identityKey:true},result:identity}]}})
 evidence.flush()
 console.log(JSON.stringify({verification:await verifyNativeConditionalConformance(report),assertions:report.assertions,errors:report.errors},null,2))
}finally {globalThis.fetch=nativeFetch;await wallet?.destroy();await services.close(); const after=capture(); fs.writeFileSync('out/conditional-preflight-20261111/source-after-7.json',JSON.stringify(after,null,2)+'\n'); if (JSON.stringify(before)!==JSON.stringify(after)) throw Error('Engineering source changed during preflight')}
