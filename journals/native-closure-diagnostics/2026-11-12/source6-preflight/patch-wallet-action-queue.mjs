import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
const wallet=process.cwd(),home=import.meta.dirname,require=createRequire(path.join(wallet,'package.json'))
const {SourceMapConsumer,SourceMapGenerator}=require('source-map'),base=path.join(wallet,'node_modules/@bsv/wallet-toolbox-client/out'),sha=b=>createHash('sha256').update(b).digest('hex')
const output=path.join(home,'wallet-action-queue-prepared');assert.ok(!fs.existsSync(output));fs.mkdirSync(output)
const pending=[],receipts=[]
for(const format of ['cjs','mjs']){
 const name=`index.client.${format}`,file=path.join(base,name),before=fs.readFileSync(file,'utf8'),old=before.split('\n')
 assert.ok(!before.includes('yoursOriginActionQueues'))
 const classLine=old.findIndex(line=>line==='var WalletPermissionsManager = class WalletPermissionsManager {');assert.ok(classLine>0)
 const methodLine=old.findIndex((line,index)=>index>classLine&&line==='\tasync createAction(args, originator) {');assert.ok(methodLine>classLine)
 const closeLine=old.findIndex((line,index)=>index>methodLine&&line==='\t}');assert.ok(closeLine>methodLine)
 const additions=new Map([
  [classLine,['const yoursOriginActionQueues = new WeakMap();']],
  [methodLine+1,[
   '\t\tlet queue, queueKey, queueTurn, releaseQueue;',
   '\t\tif (!this.isAdminOriginator(originator)) {',
   '\t\t\tqueue = yoursOriginActionQueues.get(this);',
   '\t\t\tif (!queue) { queue = new Map(); yoursOriginActionQueues.set(this, queue); }',
   '\t\t\tqueueKey = this.prepareOriginator(originator).normalized;',
   '\t\t\tconst previous = queue.get(queueKey) ?? Promise.resolve();',
   '\t\t\tqueueTurn = new Promise(resolve => { releaseQueue = resolve; });',
   '\t\t\tqueue.set(queueKey, queueTurn);',
   '\t\t\tawait previous;',
   '\t\t}',
   '\t\ttry {'
  ]],
  [closeLine,[
   '\t\t} finally {',
   '\t\t\tif (releaseQueue) {',
   '\t\t\t\treleaseQueue();',
   '\t\t\t\tif (queue.get(queueKey) === queueTurn) queue.delete(queueKey);',
   '\t\t\t}',
   '\t\t}'
  ]]
 ])
 const lines=[],originalPositions=new Map(),inserted=[]
 for(const[index,line]of old.entries()){
  for(const added of additions.get(index)??[]){lines.push(added);inserted.push(lines.length)}
  lines.push(line);originalPositions.set(index+1,lines.length)
 }
 const after=lines.join('\n'),footer=after.match(/\/\/# sourceMappingURL=(\S+)\s*$/);assert.ok(footer)
 const mapFile=path.join(base,footer[1]),rawMap=JSON.parse(fs.readFileSync(mapFile)),fragment=`origin-action-queue-patch/${name}`,content=['// Yours: per-manager/per-origin FIFO action creation; pending and signed debits remain in the allowance.',...inserted.map(line=>lines[line-1])].join('\n')+'\n'
 const generated=await SourceMapConsumer.with(rawMap,null,consumer=>{
  const generator=new SourceMapGenerator({file:rawMap.file})
  consumer.eachMapping(mapping=>{
   const next=originalPositions.get(mapping.generatedLine);assert.ok(next)
   const item={generated:{line:next,column:mapping.generatedColumn}}
   if(mapping.source!==null&&mapping.originalLine!==null){item.source=mapping.source;item.original={line:mapping.originalLine,column:mapping.originalColumn};if(mapping.name!==null)item.name=mapping.name}
   generator.addMapping(item)
  })
  for(const source of consumer.sources)generator.setSourceContent(source,consumer.sourceContentFor(source,true))
  generator.setSourceContent(fragment,content)
  for(const[line,index]of inserted.map((line,index)=>[line,index]))generator.addMapping({generated:{line,column:0},source:fragment,original:{line:index+2,column:0}})
  return generator.toString()+'\n'
 })
 await SourceMapConsumer.with(generated,null,consumer=>{for(const line of inserted){const position=consumer.originalPositionFor({line,column:0});assert.equal(position.source,fragment);assert.equal(position.line,inserted.indexOf(line)+2)}})
 for(const[target,bytes]of[[file,Buffer.from(after)],[mapFile,Buffer.from(generated)]]){
  const original=fs.readFileSync(target);fs.writeFileSync(path.join(output,path.basename(target)+'.before'),original);fs.writeFileSync(path.join(output,path.basename(target)),bytes)
  pending.push([target,bytes]);receipts.push({path:path.relative(wallet,target),beforeSha256:sha(original),afterSha256:sha(bytes),bytes:bytes.length,insertedGeneratedLines:inserted})
 }
}
if(process.argv.includes('--write'))for(const[file,bytes]of pending)fs.writeFileSync(file,bytes)
fs.writeFileSync(path.join(output,'receipt.json'),JSON.stringify({claim:'LOCAL_PACKAGE_PATCH_PREPARATION',written:process.argv.includes('--write'),files:receipts},null,2)+'\n')
console.log(JSON.stringify({written:process.argv.includes('--write'),files:receipts.length,sourceMapsVerified:true}))
