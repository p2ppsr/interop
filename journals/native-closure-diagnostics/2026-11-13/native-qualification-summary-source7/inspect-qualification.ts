// LAB_SELF_TEST_ONLY read-only inspection; emits no qualification file.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import assert from 'node:assert/strict'
import {verifyNativeWallet} from '../source16-replay/source/synthesis/src/wallet-lab/native/verify.js'
const directory=path.resolve('out/source16-native-intake/original'),file=path.join(directory,'qualification.json'),raw=fs.readFileSync(file),before=createHash('sha256').update(raw).digest('hex'),result=await verifyNativeWallet(directory)
const undefinedFields:string[]=[],unsupported:any[]=[];const walk=(x:any,p:string)=>{if(x===undefined){undefinedFields.push(p);return}if(x!==null&&typeof x==='object'){if(Array.isArray(x)){for(let i=0;i<x.length;i++){if(!Object.hasOwn(x,i))unsupported.push({path:p+'['+i+']',kind:'hole'});else walk(x[i],p+'['+i+']')}}else for(const[k,v]of Object.entries(x))walk(v,p+'.'+k)}};walk(result,'qualification')
assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex'),before)
const projected=JSON.parse(JSON.stringify(result));assert.deepEqual(projected,JSON.parse(raw.toString()))
const receipt={claim:'LAB_SELF_TEST_ONLY',nativeQualificationIssued:false,originalQualificationSha256:before,originalBytesUnchanged:true,originalNativeQualification:true,undefinedFields,unsupported,serializedProjectionEqualsOriginal:true};fs.writeFileSync('out/source17-preflight/qualification-inspection.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt))
