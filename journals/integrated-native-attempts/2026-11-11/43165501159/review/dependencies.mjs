import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
const root=fs.realpathSync(process.cwd()),home=path.join(root,'out/native-review-43165501159'),snapshot=JSON.parse(fs.readFileSync(path.join(home,'snapshot.json'))),frozen=fs.realpathSync(snapshot.root),sha=b=>createHash('sha256').update(b).digest('hex')
assert.equal(snapshot.source,'69b1b52f0c3d46cbfac91c78b38eb2e4dffbac99');assert.equal(process.versions.node,'24.22.1')
const receipts=[]
for(const dependency of ['synthesis','integrations/services','components/transport']) {
 const expected=JSON.parse(fs.readFileSync(path.join(frozen,dependency,'package-lock.json'))),modules=fs.realpathSync(path.join(frozen,dependency,'node_modules')),bytes=fs.readFileSync(path.join(modules,'.package-lock.json')),installed=JSON.parse(bytes)
 assert.equal(expected.lockfileVersion,3);assert.equal(installed.lockfileVersion,3)
 for(const name of ['package.json','package-lock.json'])assert.equal(sha(fs.readFileSync(path.join(root,dependency,name))),sha(fs.readFileSync(path.join(frozen,dependency,name))))
 for(const [name,actual]of Object.entries(installed.packages)) {
  assert.ok(name.startsWith('node_modules/')&&!name.split('/').some(p=>!p||p==='.'||p==='..'))
  const locked=expected.packages[name];assert.ok(locked&&!locked.link,`Unpinned dependency ${dependency}/${name}`)
  for(const field of ['version','resolved','integrity','dependencies','optionalDependencies','peerDependencies','peerDependenciesMeta'])assert.deepEqual(actual[field],locked[field],`${dependency}/${name}:${field}`)
  const directory=path.join(modules,name.slice(13));assert.ok(fs.lstatSync(directory).isDirectory()&&!fs.lstatSync(directory).isSymbolicLink());assert.equal(JSON.parse(fs.readFileSync(path.join(directory,'package.json'))).version,locked.version)
 }
 for(const [name,locked]of Object.entries(expected.packages))if(name&&!locked.optional)assert.ok(installed.packages[name],`Missing required ${dependency}/${name}`)
 receipts.push({dependency,modules,installedPackages:Object.keys(installed.packages).length,installedLockSha256:sha(bytes),frozenLockSha256:sha(fs.readFileSync(path.join(frozen,dependency,'package-lock.json')))})
}
const result={schema:'tpnil-frozen-replay-dependency-review@1',verified:true,source:snapshot.source,node:process.version,claim:'DEPENDENCY_METADATA_VERIFICATION_ONLY',limitation:'Verifies installed lock metadata and package versions; does not claim rehashing every installed package against its npm tarball.',dependencies:receipts}
fs.writeFileSync(path.join(home,'dependencies.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result,null,2))
