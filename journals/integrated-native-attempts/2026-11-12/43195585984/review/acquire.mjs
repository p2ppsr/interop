import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
const root=fs.realpathSync(process.cwd()),runId=43195585984,source='c648022b2d9209b7350527bd5553d73e3e82a52c',directory=path.join(root,'out/native-review-43195585984/acquisition')
assert.ok(!fs.existsSync(directory),'Acquisition directory already exists; preserve it rather than overwrite')
fs.mkdirSync(directory)
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),files=[]
function acquire(endpoint,name){const bytes=execFileSync('gh',['api',endpoint],{cwd:root,maxBuffer:512*1024*1024,timeout:120000});fs.writeFileSync(path.join(directory,name),bytes,{flag:'wx'});files.push({path:name,bytes:bytes.length,sha256:sha(bytes),endpoint});return bytes}
const receipt={schema:'tpnil-native-attempt-original-acquisition@1',runId,source,startedAt:new Date().toISOString(),files,result:'NOT_VERIFIED'}
try{
 const run=JSON.parse(acquire(`repos/p2ppsr/interop/actions/runs/${runId}`,'run.json'))
 assert.equal(run.head_sha,source);assert.equal(run.status,'completed');assert.equal(run.event,'workflow_dispatch');assert.equal(run.run_attempt,1);receipt.conclusion=run.conclusion;receipt.workflowUrl=run.html_url
 const jobs=JSON.parse(acquire(`repos/p2ppsr/interop/actions/runs/${runId}/jobs?per_page=100`,'jobs.json'));assert.equal(jobs.total_count,jobs.jobs.length);for(const job of jobs.jobs){assert.equal(job.status,'completed');if(job.conclusion!=='skipped')acquire(`repos/p2ppsr/interop/actions/jobs/${job.id}/logs`,`job-${job.id}.log`)}
 const artifacts=JSON.parse(acquire(`repos/p2ppsr/interop/actions/runs/${runId}/artifacts?per_page=100`,'artifacts.json'))
 assert.equal(artifacts.total_count,artifacts.artifacts.length)
 acquire(`repos/p2ppsr/interop/actions/runs/${runId}/logs`,'all-job-logs.zip')
 const selected=artifacts.artifacts.filter(row=>row.name==='native-go-yours-wallet-pr368-coverage1');assert.equal(selected.length,1,'Expected original native artifact is missing or ambiguous')
 const artifact=selected[0];assert.equal(artifact.expired,false)
 const bytes=acquire(`repos/p2ppsr/interop/actions/artifacts/${artifact.id}/zip`,'original-native.zip')
 assert.equal(artifact.digest,`sha256:${sha(bytes)}`);assert.equal(bytes.length,artifact.size_in_bytes)
 receipt.artifact={id:artifact.id,name:artifact.name,githubDigest:artifact.digest,githubDigestVerified:true}
 const integrity=execFileSync('python3',['-c','import sys,zipfile,json; rows=[]\nfor p in sys.argv[1:]:\n z=zipfile.ZipFile(p); assert z.testzip() is None; rows.append({"path":p,"members":len(z.infolist()),"crc":"PASS"})\nprint(json.dumps(rows))',path.join(directory,'original-native.zip'),path.join(directory,'all-job-logs.zip')],{encoding:'utf8',timeout:60000})
 receipt.zipIntegrity=JSON.parse(integrity);receipt.result='ORIGINAL_BYTES_VERIFIED'
}catch(error){receipt.failure={name:error.name,message:error.message};process.exitCode=1}
finally{receipt.completedAt=new Date().toISOString();fs.writeFileSync(path.join(directory,'acquisition.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(receipt,null,2))}
