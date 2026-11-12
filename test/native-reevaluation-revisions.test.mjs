import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {execFileSync} from 'node:child_process'
import {validateReevaluationPlan,validateReevaluationLock,originalReevaluationPlanPath,previousReevaluationPlanPath,previousReevaluationPlanId,previousReevaluationPlanSha256,currentReevaluationPlanPath,currentReevaluationPlanId,retainedSource3PlanPath,retainedSource3PlanId,retainedSource3PlanSha256,retainedSource4PlanPath,retainedSource4PlanId,retainedSource4PlanSha256,retainedSource5PlanPath,retainedSource5PlanId,retainedSource5PlanSha256,retainedSource6PlanPath,retainedSource6PlanId,retainedSource6PlanSha256,retainedSource7PlanPath,retainedSource7PlanId,retainedSource7PlanSha256,originalReevaluationPlanSha256,evaluatorSourceNames,sha256} from '../scripts/native-reevaluation.mjs'
const root=path.resolve(import.meta.dirname,'..'),read=name=>fs.readFileSync(path.join(root,name)),parse=name=>JSON.parse(read(name))
const acceptedSource='9a9e99f1fb5a10fc8b6726aaa6a0d7dc239ec47e'
const previousSource='6b174e0b903225923999a44fb1de7d67cc4e2959'
function temporary(fn){const directory=fs.mkdtempSync(path.join(os.tmpdir(),'tpnil-reevaluation-revision-'));try{return fn(directory)}finally{fs.rmSync(directory,{recursive:true,force:true})}}
function write(root,name,bytes){const file=path.join(root,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes)}

test('prospective reevaluation binds current source without rewriting accepted plan or retained acceptance',()=>{
 const original=parse(originalReevaluationPlanPath),previous=parse(previousReevaluationPlanPath),current=parse(currentReevaluationPlanPath)
 assert.deepEqual(read(originalReevaluationPlanPath),execFileSync('git',['show',`${acceptedSource}:${originalReevaluationPlanPath}`],{cwd:root}))
 assert.equal(sha256(read(originalReevaluationPlanPath)),originalReevaluationPlanSha256)
 assert.deepEqual(read(previousReevaluationPlanPath),execFileSync('git',['show',`${previousSource}:${previousReevaluationPlanPath}`],{cwd:root}))
 assert.equal(sha256(read(previousReevaluationPlanPath)),previousReevaluationPlanSha256)
 assert.equal(current.id,currentReevaluationPlanId);assert.equal(current.sourceBindingRevision,8)
 assert.deepEqual(current.predecessor,{path:retainedSource7PlanPath,sha256:retainedSource7PlanSha256})
 assert.deepEqual(read(retainedSource4PlanPath),execFileSync('git',['show',`69b1b52f0c3d46cbfac91c78b38eb2e4dffbac99:${retainedSource4PlanPath}`],{cwd:root}))
 assert.deepEqual(read(retainedSource3PlanPath),execFileSync('git',['show',`585211c193d0288effeb466bda38fe6ef23ac94d:${retainedSource3PlanPath}`],{cwd:root}))
 for(const key of ['original','rust','expected']){assert.deepEqual(current[key],previous[key]);assert.deepEqual(current[key],original[key])}
 validateReevaluationPlan(current,root)
 assert.throws(()=>validateReevaluationPlan(previous,root),/Evaluator input differs/)
 assert.throws(()=>validateReevaluationPlan(original,root),/Evaluator input differs/)
})

test('accepted predecessor remains valid under its recorded frozen evaluator sources',()=>temporary(directory=>{
 const previous=parse(originalReevaluationPlanPath)
 for(const file of [...evaluatorSourceNames,previous.rust.manifest]) write(directory,file,execFileSync('git',['show',`${acceptedSource}:${file}`],{cwd:root}))
 validateReevaluationPlan(previous,directory)
}))

test('source-2 predecessor remains valid with its exact frozen evaluator source and original ancestry',()=>temporary(directory=>{
 const previous=parse(previousReevaluationPlanPath)
 for(const file of [...evaluatorSourceNames,previous.rust.manifest,previousReevaluationPlanPath,originalReevaluationPlanPath])write(directory,file,execFileSync('git',['show',`${previousSource}:${file}`],{cwd:root}))
 validateReevaluationPlan(previous,directory)
}))

test('source revision rejects predecessor substitution, revision downgrade and changed native or Rust criteria',()=>{
 const current=parse(currentReevaluationPlanPath)
 for(const mutate of [p=>delete p.sourceBindingRevision,p=>p.sourceBindingRevision=1,p=>p.sourceBindingRevision=2,p=>p.sourceBindingRevision='3',p=>p.id=previousReevaluationPlanId,p=>delete p.predecessor,p=>p.predecessor.sha256='00'.repeat(32),p=>p.predecessor.path=currentReevaluationPlanPath,p=>p.predecessor={path:originalReevaluationPlanPath,sha256:originalReevaluationPlanSha256},p=>p.original.sha256='11'.repeat(32),p=>p.original.workflowRun++,p=>p.expected.nativeAssertions--,p=>p.rust.inputNames.reverse()]){
  const changed=structuredClone(current);mutate(changed);assert.throws(()=>validateReevaluationPlan(changed,root))
 }
})

test('prospective run lock binds all eight plan revisions to its real committed evaluator source',()=>temporary(directory=>{
 const plan=parse(currentReevaluationPlanPath)
 for(const file of [currentReevaluationPlanPath,retainedSource7PlanPath,retainedSource6PlanPath,retainedSource5PlanPath,retainedSource4PlanPath,retainedSource3PlanPath,previousReevaluationPlanPath,originalReevaluationPlanPath,...evaluatorSourceNames,plan.rust.manifest])write(directory,file,read(file))
 const git=(...args)=>execFileSync('git',args,{cwd:directory,encoding:'utf8'});git('init','-q');git('add','.');git('-c','user.name=TPNIL fixture','-c','user.email=fixture@example.invalid','commit','-qm','Prospective reevaluation source fixture')
 const lock={schema:'tpnil-native-integrated-reevaluation-run-lock@1',planPath:currentReevaluationPlanPath,plan,planSha256:sha256(read(currentReevaluationPlanPath)),evaluatorSource:git('rev-parse','HEAD').trim(),sourceDirty:false}
 validateReevaluationLock(lock,directory)
 assert.throws(()=>validateReevaluationLock({...lock,planPath:originalReevaluationPlanPath},directory))
 assert.throws(()=>validateReevaluationLock({...lock,planPath:previousReevaluationPlanPath},directory))
 for(const file of [retainedSource7PlanPath,retainedSource6PlanPath,retainedSource5PlanPath,retainedSource4PlanPath,retainedSource3PlanPath,previousReevaluationPlanPath,originalReevaluationPlanPath]) {
  fs.appendFileSync(path.join(directory,file),' ')
  assert.throws(()=>validateReevaluationLock(lock,directory),/Accepted predecessor plan changed/)
  write(directory,file,read(file))
 }
 // Working-tree restoration alone cannot hide a changed ancestor in the
 // committed source identified by the lock.
 fs.appendFileSync(path.join(directory,previousReevaluationPlanPath),' ')
 git('add','.');git('-c','user.name=TPNIL fixture','-c','user.email=fixture@example.invalid','commit','-qm','Changed historical predecessor fixture')
 write(directory,previousReevaluationPlanPath,read(previousReevaluationPlanPath))
 assert.throws(()=>validateReevaluationLock({...lock,evaluatorSource:git('rev-parse','HEAD').trim()},directory),/Accepted predecessor differs at evaluator source/)
}))


test('source3 remains valid under its exact executed source and all predecessors',()=>temporary(directory=>{
 const plan=parse(retainedSource3PlanPath)
 for(const file of [...evaluatorSourceNames,plan.rust.manifest,retainedSource3PlanPath,previousReevaluationPlanPath,originalReevaluationPlanPath])write(directory,file,execFileSync('git',['show',`585211c193d0288effeb466bda38fe6ef23ac94d:${file}`],{cwd:root}))
 validateReevaluationPlan(plan,directory)
 assert.equal(plan.id,retainedSource3PlanId);assert.equal(sha256(read(retainedSource3PlanPath)),retainedSource3PlanSha256)
}))


test('source4 remains valid under its exact executed source and all predecessors',()=>temporary(directory=>{
 const plan=parse(retainedSource4PlanPath)
 for(const file of [...evaluatorSourceNames,plan.rust.manifest,retainedSource4PlanPath,retainedSource3PlanPath,previousReevaluationPlanPath,originalReevaluationPlanPath])write(directory,file,execFileSync('git',['show',`69b1b52f0c3d46cbfac91c78b38eb2e4dffbac99:${file}`],{cwd:root}))
 validateReevaluationPlan(plan,directory)
 assert.equal(plan.id,retainedSource4PlanId);assert.equal(sha256(read(retainedSource4PlanPath)),retainedSource4PlanSha256)
}))

test('source5 remains valid under its exact executed source and all predecessors',()=>temporary(directory=>{
 const plan=parse(retainedSource5PlanPath),source='c648022b2d9209b7350527bd5553d73e3e82a52c'
 for(const file of [...evaluatorSourceNames,plan.rust.manifest,retainedSource5PlanPath,retainedSource4PlanPath,retainedSource3PlanPath,previousReevaluationPlanPath,originalReevaluationPlanPath])write(directory,file,execFileSync('git',['show',`${source}:${file}`],{cwd:root}))
 validateReevaluationPlan(plan,directory);assert.equal(plan.id,retainedSource5PlanId);assert.equal(sha256(read(retainedSource5PlanPath)),retainedSource5PlanSha256)
}))


test('source6 remains valid under its exact executed source and all predecessors',()=>temporary(directory=>{
 const plan=parse(retainedSource6PlanPath),source='1f9fe0f9b979e9bbca66e90335f02ba2b80c7d41'
 for(const file of [...evaluatorSourceNames,plan.rust.manifest,retainedSource6PlanPath,retainedSource5PlanPath,retainedSource4PlanPath,retainedSource3PlanPath,previousReevaluationPlanPath,originalReevaluationPlanPath])write(directory,file,execFileSync('git',['show',`${source}:${file}`],{cwd:root}))
 validateReevaluationPlan(plan,directory);assert.equal(plan.id,retainedSource6PlanId);assert.equal(sha256(read(retainedSource6PlanPath)),retainedSource6PlanSha256)
}))
