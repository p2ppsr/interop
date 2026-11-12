import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {ControlledWalletServices} from '../../synthesis/src/wallet-lab/services.ts'
import {createFixtureWallet} from '../../synthesis/src/storage-sync/fixture-wallet.ts'
import {captureNativeSafeBoundary} from '../../synthesis/src/wallet-lab/yours-driver.ts'
import {controlledHeaderFixture,getControlledHeaderFixture} from '../../synthesis/src/wallet-lab/native/controlled-header-fixture.ts'
const directory=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'tpnil-positive-header-')),services=new ControlledWalletServices({webroot:directory}),errors:unknown[]=[];let wallet:any,result:any
try{
 await services.start();await services.fundRemoteWalletFromTeranode('77'.repeat(32),JSON.parse(fs.readFileSync('fixtures/teranode/wab-funding-v1.json','utf8')));wallet=await createFixtureWallet(services,'77'.repeat(32));(globalThis as any).window={CWI:wallet}
 const selected=getControlledHeaderFixture(controlledHeaderFixture),observation=await captureNativeSafeBoundary(selected)
 assert.deepEqual(observation.headerRequest,{height:1});assert.deepEqual(observation.header,{header:selected.header});assert.equal(observation.headerError,undefined);assert.equal(observation.signatureVerified,true);assert.equal(observation.hmacVerified,true);assert.equal(Buffer.from(observation.decrypted).toString(),'TPNIL boundary fixture')
 result={schema:'tpnil-controlled-header-reference-preflight@1',claim:'TYPESCRIPT_REFERENCE_ONLY_NOT_NATIVE_QUALIFICATION',nativeExecutions:0,verified:true,selected,observation,services:'Actual ControlledWalletServices and Wallet Toolbox Wallet with authenticated remote storage and fixture-bound chain services'}
}catch(e){errors.push(e)}finally{delete (globalThis as any).window;try{await wallet?.destroy()}catch(e){errors.push(e)};try{await services.close()}catch(e){errors.push(e)};fs.rmSync(directory,{recursive:true,force:true})}
if(errors.length)throw new AggregateError(errors,'Header preflight or cleanup failed')
result.cleanup={walletClosed:true,servicesClosed:true,directoryRemoved:!fs.existsSync(directory)};result.inputs=Object.fromEntries(['synthesis/src/wallet-lab/yours-driver.ts','synthesis/src/wallet-lab/native/controlled-header-fixture.ts','programs/ISI-4/profiles/brc100-boundary-1.0.0/controlled-header-1.0.0.json'].map(p=>[p,createHash('sha256').update(fs.readFileSync(p)).digest('hex')]))
fs.writeFileSync('out/native-review-43157437280/header-reference-preflight.json',JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result,null,2))
