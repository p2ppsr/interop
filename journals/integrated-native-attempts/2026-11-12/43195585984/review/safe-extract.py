import sys, json, hashlib, zipfile, pathlib, stat
archive, destination=sys.argv[1:]
root=pathlib.Path(destination)
if root.exists(): raise RuntimeError('Extraction destination already exists')
root.mkdir(parents=True)
rows=[];seen=set();total=0
with zipfile.ZipFile(archive) as source:
 if source.testzip() is not None: raise RuntimeError('ZIP CRC verification failed')
 for entry in source.infolist():
  p=pathlib.PurePosixPath(entry.filename)
  if entry.filename in seen or p.is_absolute() or '..' in p.parts or '\\' in entry.filename or not p.parts or '\x00' in entry.filename: raise RuntimeError('Unsafe/duplicate ZIP member')
  seen.add(entry.filename)
  if stat.S_ISLNK(entry.external_attr>>16): raise RuntimeError('ZIP symlink rejected')
  total+=entry.file_size
  if total>536870912 or len(seen)>10000: raise RuntimeError('ZIP expansion exceeds review bounds')
  if entry.is_dir(): continue
  body=source.read(entry);target=root.joinpath(*p.parts);target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(body)
  rows.append({'path':entry.filename,'bytes':len(body),'sha256':hashlib.sha256(body).hexdigest()})
print(json.dumps({'verified':True,'zipIntegrity':'PASS','members':sorted(rows,key=lambda row:row['path']),'uncompressedBytes':total}))
