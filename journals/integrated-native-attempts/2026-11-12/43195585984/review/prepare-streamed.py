from pathlib import Path
import subprocess,json,hashlib,os,time
root=Path.cwd().resolve();source='c648022b2d9209b7350527bd5553d73e3e82a52c';home=root/'out/native-review-43195585984';directory=home/'source'
if directory.exists():
 assert not list(directory.iterdir()),'Existing incomplete directory unexpectedly nonempty'
 directory.rename(home/'failed-empty-source-v1')
paths=['package.json','.nvmrc','.github','scripts','synthesis','infra','fixtures','components','integrations','itcves','programs','config','src','bin','adapters','schemas','suts']
tree=subprocess.check_output(['git','ls-tree','-r','-z',source,'--',*paths],cwd=root).split(b'\0');rows=[]
for row in tree:
 if not row:continue
 meta,name=row.decode().split('\t');mode,kind,blob=meta.split();p=Path(name)
 assert mode in ['100644','100755'] and kind=='blob' and not p.is_absolute() and all(x not in ['.','..',''] for x in p.parts)
 rows.append((name,mode,blob))
assert rows
directory.mkdir()
with (home/'archive-stream.stderr.log').open('wb') as err:
 archive=subprocess.Popen(['git','archive','--format=tar',source,'--',*sorted(set(n.split('/')[0] for n,_,_ in rows))],cwd=root,stdout=subprocess.PIPE,stderr=err)
 unpack=subprocess.run(['tar','-xf','-','-C',str(directory)],stdin=archive.stdout,capture_output=True,timeout=180)
 archive.stdout.close();status=archive.wait(timeout=180)
 assert status==0 and unpack.returncode==0,(status,unpack.returncode,unpack.stderr)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
expected=(directory/'.nvmrc').read_text().strip().removeprefix('v');actual=subprocess.check_output(['/Users/tyeverett/.nvm/versions/node/v24.22.1/bin/node','-p','process.versions.node'],text=True).strip();assert actual==expected
inventory=[]
for name,mode,blob in rows:
 p=directory/name;assert p.is_file() and not p.is_symlink();data=p.read_bytes();assert hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()==blob,name
 inventory.append({'path':name,'bytes':len(data),'gitBlob':blob,'sha256':hashlib.sha256(data).hexdigest()})
reused=[]
for dependency in ['synthesis','integrations/services','components/transport']:
 for name in ['package.json','package-lock.json']:assert sha(root/dependency/name)==sha(directory/dependency/name)
 target=root/dependency/'node_modules';assert target.is_dir();(directory/dependency/'node_modules').symlink_to(target,target_is_directory=True);reused.append(dependency+'/node_modules')
assert sha(root/'components/rust/Cargo.lock')==sha(directory/'components/rust/Cargo.lock')
for cache in ['components/rust/target','out']:
 if (root/cache).exists():(directory/cache).symlink_to(root/cache,target_is_directory=True);reused.append(cache)
snapshot={'root':str(directory.resolve()),'source':source,'files':len(rows),'reused':reused,'preparedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'node':actual,'materializer':'prepare-streamed.py','materializerSha256':sha(Path(__file__).resolve()),'historicalHelperModified':False,'originalBufferFailurePreserved':True}
(home/'snapshot.json').write_text(json.dumps(snapshot,indent=2)+'\n')
(home/'source-inventory.json').write_text(json.dumps({'source':source,'canonicalRoot':str(directory.resolve()),'files':inventory,'allBytesMatchGit':True,'scriptSha256':sha(Path(__file__).resolve())},indent=2)+'\n')
print(json.dumps({'files':len(rows),'bytes':sum(x['bytes'] for x in inventory),'snapshotSha256':sha(home/'snapshot.json'),'sourceInventorySha256':sha(home/'source-inventory.json')}))
