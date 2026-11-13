import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import { extractSourcemapFromFile } from '../../../synthesis/node_modules/@vitest/utils/dist/source-map/node.js';
import { parseErrorStacktrace } from '../../../synthesis/node_modules/@vitest/utils/dist/source-map.js';
const root=process.cwd();const results=[];
for(const name of ['register-D46fvsV_.cjs','register-CFH5oNdT.mjs']){
 const file=path.join(root,'synthesis/node_modules/tsx/dist',name);const bytes=fs.readFileSync(file);let direct,stack;
 try{direct={returned:extractSourcemapFromFile(bytes.toString(),file)}}catch(error){direct={name:error.name,message:error.message,stack:error.stack}}
 const error=new Error('Actual child failed');error.stack=`Error: Actual child failed\n    at Object.transformer (${file}:2:100)`;
 try{stack={returned:parseErrorStacktrace(error,{getSourceMap(file){return extractSourcemapFromFile(fs.readFileSync(file,'utf8'),file)?.map}})}}catch(error){stack={name:error.name,message:error.message,stack:error.stack}}
 results.push({file,sha256:createHash('sha256').update(bytes).digest('hex'),direct,stack});
}
console.log(JSON.stringify({claim:'LOCAL_DEPENDENCY_REPRODUCTION_ONLY',node:process.version,results},null,2));
