import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
export const digest = bytes => createHash('sha256').update(bytes).digest('hex')
export function inventory(directory) {
  const files=[]
  function walk(current) {
    for(const entry of fs.readdirSync(current,{withFileTypes:true})) {
      const target=path.join(current,entry.name)
      if(entry.isSymbolicLink()) throw new Error(`Evidence symlink: ${target}`)
      if(entry.isDirectory()) walk(target)
      else if(entry.isFile()) {
        const name=path.relative(directory,target).split(path.sep).join('/')
        if(['manifest.json','verification.json'].includes(name)) continue
        const bytes=fs.readFileSync(target);files.push({path:name,sha256:digest(bytes),size:bytes.length})
      } else throw new Error(`Unsupported evidence file: ${target}`)
    }
  }
  walk(directory);return files.sort((a,b)=>a.path.localeCompare(b.path))
}
export function projection(report) {
  const runs=report.runs??[{assertions:report.assertions}]
  return runs.flatMap((run,index)=>(run.assertions??[]).map(a=>({run:run.name??index,implementation:a.implementation??null,id:a.id.replace(/[a-f0-9]{64}/g,'<txid>'),result:a.result??a.verdict}))).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))
}
export function verifyIntegrated(directory) {
  const read=name=>JSON.parse(fs.readFileSync(path.join(directory,name),'utf8'))
  const manifest=read('manifest.json'), result=read('result.json'), lock=read('run-lock.json')
  assert.equal(manifest.schema,'tpnil-integrated-manifest@1')
  assert.deepEqual(inventory(directory),manifest.files,'Evidence content or file set differs')
  assert.equal(result.schema,'tpnil-integrated-result@1')
  assert.equal(result.profile,'ITCVE-1@1.3.0')
  assert.equal(lock.schema,'tpnil-integrated-run-lock@1')
  const frozen=JSON.parse(fs.readFileSync(new URL('../itcves/ITCVE-1/1.3.0/profile.json',import.meta.url),'utf8'))
  assert.deepEqual(lock.profile,frozen,'The declared lane set differs from the frozen profile')
  const inputs=['itcves/ITCVE-1/1.3.0/profile.json',...frozen.componentProfiles,...frozen.dependencies]
  assert.deepEqual(Object.keys(lock.files).sort(),[...inputs].sort())
  for(const file of inputs) assert.equal(lock.files[file],digest(fs.readFileSync(new URL('../'+file,import.meta.url))),`Frozen input differs: ${file}`)
  assert.ok(!result.executionError)
  assert.equal(lock.profile.id,'ITCVE-1');assert.equal(lock.profile.version,'1.3.0')
  assert.match(lock.source,/^[0-9a-f]{40}$/)
  assert.equal(lock.dirty,false,'Scored integration requires committed source')
  const expected=lock.profile.lanes
  assert.deepEqual(result.lanes.map(x=>x.id).sort(),[...expected].sort())
  for(const lane of result.lanes) {
    assert.equal(lane.runs.length,lane.id==='storage-sync'?1:2)
    const projections=[]
    for(const run of lane.runs) {
      assert.equal(run.timedOut,false)
      assert.equal(run.exitCode,0,`${lane.id} did not complete`)
      assert.ok(!path.isAbsolute(run.result)&&!run.result.split('/').includes('..'))
      const report=read(run.result)
      assert.ok(!report.executionError,`${lane.id} execution error`)
      const observed=projection(report)
      assert.ok(observed.length>0,`${lane.id} has no assertions`)
      assert.ok(observed.every(x=>['PASS','FAIL','BLOCKED'].includes(x.result)))
      assert.deepEqual(observed,run.assertions)
      if(lane.id==='storage-sync') {
        assert.equal(report.runs.length,8);assert.equal(report.repeatability.length,4)
        assert.ok(report.repeatability.every(x=>x.matches));assert.ok(report.runs.every(x=>x.cleanup===true))
      } else {
        const cleanup=report.cleanup
        assert.ok(cleanup,`${lane.id} lacks cleanup evidence`)
        if(Array.isArray(cleanup)) assert.ok(cleanup.length>0&&cleanup.every(x=>!x.error&&!x.walletError&&x.running!==true&&x.closed!==false&&(x.exitCode===undefined||x.exitCode===0)&&x.signal==null),`${lane.id} cleanup failed`)
        else assert.ok(Object.values(cleanup).length>0&&Object.values(cleanup).every(x=>x===true),`${lane.id} cleanup failed`)
      }
      projections.push(observed)
    }
    if(projections.length===2) assert.deepEqual(projections[0],projections[1],`${lane.id} repetitions differ`)
  }
  return {schema:'tpnil-integrated-verification@1',verified:true,source:lock.source,profile:'ITCVE-1@1.3.0',lanes:result.lanes.length,findings:result.lanes.flatMap(l=>l.runs.flatMap(r=>r.assertions.filter(a=>a.result!=='PASS').map(a=>({lane:l.id,resultFile:r.result,...a}))))}
}
