import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {execFileSync} from 'node:child_process'
import {validateReevaluationPlan,validateReevaluationLock,originalReevaluationPlanPath,previousReevaluationPlanPath,previousReevaluationPlanId,previousReevaluationPlanSha256,currentReevaluationPlanPath,currentReevaluationPlanId,originalReevaluationPlanSha256,evaluatorSourceNames,sha256} from '../scripts/native-reevaluation.mjs'
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
 assert.equal(current.id,currentReevaluationPlanId);assert.equal(current.sourceBindingRevision,3)
 assert.deepEqual(current.predecessor,{path:previousReevaluationPlanPath,sha256:previousReevaluationPlanSha256})
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

test('prospective run lock binds all three plan revisions to its real committed evaluator source',()=>temporary(directory=>{
 const plan=parse(currentReevaluationPlanPath)
 for(const file of [currentReevaluationPlanPath,previousReevaluationPlanPath,originalReevaluationPlanPath,...evaluatorSourceNames,plan.rust.manifest])write(directory,file,read(file))
 const git=(...args)=>execFileSync('git',args,{cwd:directory,encoding:'utf8'});git('init','-q');git('add','.');git('-c','user.name=TPNIL fixture','-c','user.email=fixture@example.invalid','commit','-qm','Prospective reevaluation source fixture')
 const lock={schema:'tpnil-native-integrated-reevaluation-run-lock@1',planPath:currentReevaluationPlanPath,plan,planSha256:sha256(read(currentReevaluationPlanPath)),evaluatorSource:git('rev-parse','HEAD').trim(),sourceDirty:false}
 validateReevaluationLock(lock,directory)
 assert.throws(()=>validateReevaluationLock({...lock,planPath:originalReevaluationPlanPath},directory))
 assert.throws(()=>validateReevaluationLock({...lock,planPath:previousReevaluationPlanPath},directory))
 for(const file of [previousReevaluationPlanPath,originalReevaluationPlanPath]) {
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
