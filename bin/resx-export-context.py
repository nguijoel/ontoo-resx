"""Immutable RESX build export adapter; no checkout configuration or secret reads."""
import hashlib,io,json,re,subprocess,tarfile
from pathlib import Path

def require(v):
 if not v:raise ValueError('RESX_CONTEXT_REJECTED')

def pattern(value):
 require(isinstance(value,str) and value and '\\' not in value and not value.startswith('/') and '..' not in value.split('/'))
 parts=[];i=0
 while i<len(value):
  if value[i:i+3]=='**/':parts.append('(?:.*/)?');i+=3
  elif value[i:i+2]=='**':parts.append('.*');i+=2
  elif value[i]=='*':parts.append('[^/]*');i+=1
  elif value[i]=='?':parts.append('[^/]');i+=1
  else:parts.append(re.escape(value[i]));i+=1
 return re.compile('^'+''.join(parts)+'$')

def selected(name,manifest):
 require(isinstance(name,str) and name and '\\' not in name and not name.startswith('/') and all(x not in ('','..','.') for x in name.split('/')))
 return any(pattern(x).fullmatch(name) for x in manifest['include']) and not any(pattern(x).fullmatch(name) for x in manifest['exclude'])

DB_FIXED=frozenset(['api/package.json','api/tsconfig.json','package.json','yarn.lock',
 'bin/resx-runtime.cjs','bin/resx-runtime-profile.cjs','bin/resx-phase1-profile.cjs',
 'deploy/resx/Dockerfile','deploy/resx/Dockerfile.dockerignore','deploy/resx/build-inputs.json'])
DB_SELECTION={'version':1,'roots':['api/src/'],'files':sorted(DB_FIXED),'algorithm':'sha256-path-bytes-inventory-v1'}

def database_closure(inventory):
 rows=sorted([row for row in inventory if row['path'].startswith('api/src/') or row['path'] in DB_FIXED],key=lambda row:row['path'])
 require(DB_FIXED.issubset({row['path'] for row in rows}) and any(row['path'].startswith('api/src/') for row in rows))
 require(len({row['path'] for row in rows})==len(rows))
 payload={'selection':DB_SELECTION,'inventory':rows}
 raw=json.dumps(payload,sort_keys=True,separators=(',',':')).encode()
 return {'version':1,'sha256':hashlib.sha256(raw).hexdigest(),'files':len(rows),
  'selectionSha256':hashlib.sha256(json.dumps(DB_SELECTION,sort_keys=True,separators=(',',':')).encode()).hexdigest()}

def export(source,output):
 require(re.fullmatch('[a-f0-9]{40}',source) is not None)
 def git(*args):return subprocess.check_output(['git',*args],stderr=subprocess.DEVNULL)
 manifest_raw=git('show',source+':deploy/resx/build-inputs.json');manifest=json.loads(manifest_raw)
 require(manifest['version']==1 and manifest['platform']=='linux/amd64')
 require(manifest['baseImage']=='docker.io/library/node@sha256:47725aca53d3295ec2d3be8f62726599b3033cc262edc2c7e429909b3ac599fc')
 dockerfile=git('show',source+':deploy/resx/Dockerfile').decode('utf8')
 bases=re.findall(r'^FROM\s+([^\s]+)(?:\s+AS\s+[a-zA-Z0-9_-]+)?\s*$',dockerfile,re.M|re.I)
 require(len(bases)==2 and all(base==manifest['baseImage'] for base in bases))
 entries=git('ls-tree','-rz','--full-tree',source).split(b'\0');inventory=[];total=0
 # Output is an exclusive new file. No deletion, adoption or recursive cleanup.
 with Path(output).open('xb') as stream:
  with tarfile.open(fileobj=stream,mode='w',format=tarfile.USTAR_FORMAT) as archive:
   for entry in entries:
    if not entry:continue
    meta,raw_name=entry.split(b'\t',1);mode,kind,oid=meta.decode('ascii').split();name=raw_name.decode('utf8')
    if not selected(name,manifest):continue
    require(kind=='blob' and mode in ('100644','100755'))
    data=git('cat-file','blob',oid);total+=len(data)
    require(total<=32*1024*1024 and len(inventory)<5000)
    info=tarfile.TarInfo(name);info.size=len(data);info.mode=0o755 if mode=='100755' else 0o644;info.mtime=0;info.uid=info.gid=0;info.uname=info.gname=''
    archive.addfile(info,io.BytesIO(data));inventory.append({'path':name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
 require({'deploy/resx/Dockerfile','deploy/resx/Dockerfile.dockerignore','deploy/resx/build-inputs.json','package.json','yarn.lock'}.issubset({x['path'] for x in inventory}))
 with Path(output).open('rb') as stream:context_sha=hashlib.file_digest(stream,'sha256').hexdigest()
 return {'sourceSha':source,'manifestSha256':hashlib.sha256(manifest_raw).hexdigest(),'contextSha256':context_sha,'files':len(inventory),'sourceBytes':total,'inventory':inventory,'databaseClosure':database_closure(inventory)}

if __name__=='__main__':
 import sys
 try:
  require(len(sys.argv)==3)
  result=export(sys.argv[1],sys.argv[2]);Path(sys.argv[2]+'.receipt.json').write_text(json.dumps(result,sort_keys=True,separators=(',',':'))+'\n')
  print(json.dumps({k:v for k,v in result.items() if k!='inventory'}))
 except Exception:
  print('RESX_CONTEXT_REJECTED',file=sys.stderr);raise SystemExit(1)
