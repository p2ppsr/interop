import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'

const wallet=process.cwd(),home=import.meta.dirname,require=createRequire(path.join(wallet,'package.json'))
const {SourceMapConsumer,SourceMapGenerator}=require('source-map')
const base=path.join(wallet,'node_modules/@bsv/wallet-toolbox-client/out'),sha=b=>createHash('sha256').update(b).digest('hex')
const output=path.join(home,'wallet-followups-prepared');assert.ok(!fs.existsSync(output));fs.mkdirSync(output)
const pending=[],receipts=[]
function once(text,before,after){assert.equal(text.split(before).length-1,1,`Expected one ${before.slice(0,80)}`);return text.replace(before,after)}
function inMethod(text,method,operation){const needle=`\tasync ${method}(...args)`;assert.equal(text.split(needle).length-1,1);const start=text.indexOf(needle);assert.ok(start>=0);const end=text.indexOf('\n\tasync ',start+1);assert.ok(end>start);const part=operation(text.slice(start,end));return text.slice(0,start)+part+text.slice(end)}
for(const format of ['cjs','mjs']){
 const name=`index.client.${format}`,file=path.join(base,name),before=fs.readFileSync(file,'utf8');let after=before
 for(const method of ['discoverByIdentityKey','discoverByAttributes'])after=inMethod(after,method,part=>once(part,'seekPermission: requestArgs.seekPermission,','seekPermission: requestArgs.seekPermission ?? false,'))
 after=inMethod(after,'revealSpecificKeyLinkage',part=>once(part,'specific key linkage revelation ${requestArgs.protocolID[1]}','specific key linkage revelation ${requestArgs.counterparty} ${requestArgs.protocolID[1]}'))
 after=once(after,'\tbasketPermissionTag(basket) {','\tbasketPermissionTag(basket, kind = "basket") {')
 after=once(after,'const tag = `basket ${basket}`;','const tag = `${kind} ${basket}`;')
 after=once(after,'`basket-sha256 ${','`${kind}-sha256 ${')
 // All three producer/lookup paths use the same bounded index. Decrypted token
 // fields continue to compare the complete protocol name and counterparty.
 assert.equal(after.split('`protocolName ${protocolName}`').length-1,2)
 after=after.replaceAll('`protocolName ${protocolName}`','this.basketPermissionTag(protocolName, "protocolName")')
 after=once(after,'`protocolName ${r.protocolID[1]}`','this.basketPermissionTag(r.protocolID[1], "protocolName")')
 const oldLines=before.split('\n'),lines=after.split('\n');assert.equal(lines.length,oldLines.length)
 const changed=new Set(lines.flatMap((line,index)=>line!==oldLines[index]?[index+1]:[]));assert.equal(changed.size,9)
 const footer=after.match(/\/\/# sourceMappingURL=(\S+)\s*$/);assert.ok(footer);const mapFile=path.join(base,footer[1]),rawMap=JSON.parse(fs.readFileSync(mapFile))
 const fragment=`native-linkage-discovery-patch/${name}`,selected=[...changed].sort((a,b)=>a-b),content=['// Yours: scope linkage grants to the revealed counterparty, preserve discovery defaults, and bound permission indexes.',...selected.map(line=>lines[line-1])].join('\n')+'\n'
 const generated=await SourceMapConsumer.with(rawMap,null,consumer=>{
  const generator=new SourceMapGenerator({file:rawMap.file})
  consumer.eachMapping(mapping=>{
   if(changed.has(mapping.generatedLine))return
   const item={generated:{line:mapping.generatedLine,column:mapping.generatedColumn}}
   if(mapping.source!==null&&mapping.originalLine!==null){item.source=mapping.source;item.original={line:mapping.originalLine,column:mapping.originalColumn};if(mapping.name!==null)item.name=mapping.name}
   generator.addMapping(item)
  })
  for(const source of consumer.sources)generator.setSourceContent(source,consumer.sourceContentFor(source,true))
  generator.setSourceContent(fragment,content)
  for(const[line,index]of selected.map((line,index)=>[line,index]))generator.addMapping({generated:{line,column:0},source:fragment,original:{line:index+2,column:0}})
  return generator.toString()+'\n'
 })
 await SourceMapConsumer.with(generated,null,consumer=>{for(const line of selected){const found=consumer.originalPositionFor({line,column:0});assert.equal(found.source,fragment);assert.equal(found.line,selected.indexOf(line)+2)}})
 const patched=JSON.parse(generated);assert.equal(patched.sources.length,patched.sourcesContent.length)
 for(const[target,bytes]of[[file,Buffer.from(after)],[mapFile,Buffer.from(generated)]]){
  const original=fs.readFileSync(target);fs.writeFileSync(path.join(output,path.basename(target)+'.before'),original)
  fs.writeFileSync(path.join(output,path.basename(target)),bytes);pending.push([target,bytes]);receipts.push({path:path.relative(wallet,target),beforeSha256:sha(original),afterSha256:sha(bytes),bytes:bytes.length,changedGeneratedLines:selected})
 }
}
if(process.argv.includes('--write'))for(const[file,bytes]of pending)fs.writeFileSync(file,bytes)
fs.writeFileSync(path.join(output,'receipt.json'),JSON.stringify({claim:'LOCAL_PACKAGE_PATCH_PREPARATION',written:process.argv.includes('--write'),files:receipts},null,2)+'\n')
console.log(JSON.stringify({written:process.argv.includes('--write'),files:receipts.length,sourceMapsVerified:true}))
