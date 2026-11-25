"""Fixed DBA PRE restore performer. Transport supplies hash-sealed public code only."""
import base64,hashlib,json,os,secrets,stat,sys
from pathlib import Path

ROOT=Path('/var/lib/ontoo/resx-pre-restore-run01')
STAGE=Path('/var/lib/ontoo/resx-pre-source-archive-run01')
SECRETS=Path('/var/lib/ontoo/resx-pre/secrets')
CNF=SECRETS/'restore-pre-run01.cnf'
MODE='restore-dba-resx-pre-fixed'
SOURCE='58fd934a5b3181e4a488c4fe04f70486af3700fd'
MODULE_SHA='be8e173b3e72234dc43e5593bb456f0adc7463229d2e033fb3832816d3994798'
CUSTODY_SHA='0dcc883fdb957ea01a8c44a415c0d47e1dc96ad7756a9a7c88ac9c90e6636831'
STAGING_SHA='5a0edef2dacbb7730e1c66680ec299fbd6c45aa5563651d5acd3372fcccb27ce'
CID='f45243cc63ac603c50cc60d1e921a427b3372f57d2c3babab0ff47dfb0c191fb'
SQL_SHA='35877254af65ccab26ae94c8e2ffc48eba5773953a5ee72be18d29688fb4412b'

def sha(b):return hashlib.sha256(b).hexdigest()
def require(v):
 if not v:raise ValueError('RESX_RESTORE_PERFORMER_REJECTED')

def load(raw,pin,name):
 require(isinstance(raw,bytes) and sha(raw)==pin)
 n={'__name__':name};exec(compile(raw,'<'+name+'>','exec'),n);return n

def private_read(path,pin,size,mode):
 fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
 try:
  a=os.fstat(fd);require(stat.S_ISREG(a.st_mode) and a.st_uid==0 and a.st_gid==0 and stat.S_IMODE(a.st_mode)==mode and a.st_size==size)
  chunks=[];left=size+1
  while left:
   b=os.read(fd,min(left,65536))
   if not b:break
   chunks.append(b);left-=len(b)
  raw=b''.join(chunks);b=os.fstat(fd)
  require((a.st_dev,a.st_ino,a.st_size,a.st_mtime_ns,a.st_ctime_ns)==(b.st_dev,b.st_ino,b.st_size,b.st_mtime_ns,b.st_ctime_ns))
  require(len(raw)==size and sha(raw)==pin);return raw
 finally:os.close(fd)

def enroll(value):
 require(isinstance(value,dict) and set(value)=={'module','custody','libraries'})
 module=load(base64.b64decode(value['module'],validate=True),MODULE_SHA,'sealed_restore_module')
 custody=load(base64.b64decode(value['custody'],validate=True),CUSTODY_SHA,'sealed_native_custody')
 c,h,candidate=custody['libraries'](value['libraries'])
 # Existing guard verifies the exact engine, route, certificates and old evidence.
 receipt=json.loads(c['read'](STAGE/'staging.receipt.json',STAGING_SHA))
 require(receipt=={'sourceStaged':True,'archiveSha256':'447a045ea12d65ccf27f646d692fdb192753ef7a395b9a42eaf74f3c899e265d','archiveBytes':93253,'sqlSha256':SQL_SHA,'sqlBytes':436882,'database':'ontoo_resx_pre','containerId':CID,'sqlExecuted':False,'databaseCreated':False,'accountCreated':False,'automaticRetry':False})
 for path in (STAGE,SECRETS):
  st=os.lstat(path);require(stat.S_ISDIR(st.st_mode) and st.st_uid==0 and st.st_gid==0 and stat.S_IMODE(st.st_mode)==0o700)
 raw=private_read(STAGE/'source.sql',SQL_SHA,436882,0o400)
 model=module['inventory'](raw)
 return module,custody,c,h,raw,model

def native(custody,h,prefix,sql,restore=False):
 require(prefix in {'preflight','database','account','rights','import','lock','postflight','ddl','check'})
 require(isinstance(sql,bytes) and len(sql)<=524288 and restore==(prefix=='import'))
 # Private restore defaults file is fixed. No caller path, options or environment.
 defaults='/run/secrets/restore-pre-run01.cnf' if restore else '/run/secrets/admin.cnf'
 options=['--defaults-file='+defaults,'--protocol=socket','--socket=/run/mysqld/mysqld.sock','--skip-reconnect','--batch','--raw','--skip-column-names','--binary-mode','--default-character-set=utf8mb4']
 if prefix in {'import','ddl','check'}:options+=['--database=ontoo_resx_pre']
 if restore:options+=['--show-warnings']
 timeout=600 if restore else 60
 args=['docker','exec','--interactive','--user','0',CID,'/usr/bin/env','-i','PATH=/usr/sbin:/usr/bin:/sbin:/bin','HOME=/nonexistent','LANG=C','/usr/bin/timeout','--signal=TERM','--kill-after=5s',str(timeout)+'s','/usr/bin/mariadb']+options
 p=custody['bounded_capture'](args,sql,h['ENV'],seconds=timeout+15)
 h['save'](ROOT/(prefix+'.stdout.private'),p['stdout'])
 h['save'](ROOT/(prefix+'.stderr.private'),p['stderr'])
 result={k:v for k,v in p.items() if k not in ('stdout','stderr')}
 h['save'](ROOT/(prefix+'.exit.json'),result)
 require(p['exitCode']==0 and p['timeout'] is False and p['outputOverflow'] is False and p['captureComplete'] is True and p['captureError'] is False and p['stderr']==b'')
 return p['stdout']

def create_cnf(password):
 require(isinstance(password,str) and len(password)==64 and all(c in '0123456789abcdef' for c in password))
 raw=('[client]\nuser=ontoo_resx_pre_restore\npassword='+password+'\nprotocol=socket\nsocket=/run/mysqld/mysqld.sock\n').encode()
 fd=os.open(CNF,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW|os.O_CLOEXEC,0o400)
 try:
  os.fchmod(fd,0o400);os.fchown(fd,0,0)
  pos=0
  while pos<len(raw):pos+=os.write(fd,raw[pos:])
  os.fsync(fd)
 finally:os.close(fd)
 directory=os.open(SECRETS,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
 try:os.fsync(directory)
 finally:os.close(directory)

def perform(module,custody,h,raw,model,verify,credential=create_cnf,password_factory=lambda:secrets.token_hex(32)):
 # Shared orchestration is deliberately injected for fault/order tests.
 phase='PREFLIGHT';db='NOT_STARTED';account='NOT_STARTED';data='NOT_STARTED'
 call=lambda prefix,sql,restore=False:native(custody,h,prefix,sql,restore)
 try:
  module['preflight'](call('preflight',module['PREFLIGHT_SQL']))
  phase='CREATE_DATABASE';db='UNKNOWN'
  require(call('database',module['CREATE_DATABASE_SQL'])==b'');db='CREATED'
  phase='CREATE_RESTORE_CUSTODY';password=password_factory();credential(password)
  phase='CREATE_RESTORE_ACCOUNT';account='UNKNOWN'
  require(call('account',module['create_restore_account'](password))==b'');password=None;account='CREATED_UNVERIFIED'
  phase='VERIFY_RESTORE_RIGHTS';module['rights'](call('rights',module['RIGHTS_SQL']));account='CREATED_VERIFIED'
  phase='IMPORT';data='UNKNOWN'
  notes=call('import',raw,True);data='IMPORTED_UNVERIFIED';module['import_notes'](notes)
  phase='LOCK_RESTORE_ACCOUNT';account='LOCK_UNKNOWN'
  require(call('lock',module['LOCK_RESTORE_SQL'])==b'');account='LOCKED'
  phase='POSTFLIGHT';summary=module['postflight'](call('postflight',module['postflight_sql'](model)),model)
  phase='SHOW_CREATE';module['show_create'](call('ddl',module['show_create_sql'](model)),model)
  phase='CHECK_TABLE';module['check_tables'](call('check',module['CHECK_SQL']))
  data='IMPORTED_VERIFIED';phase='FINAL_PHYSICAL_VERIFY';verify()
  out={'restored':True,'source':SOURCE,'moduleSha256':MODULE_SHA,'stagingReceiptSha256':STAGING_SHA,'sourceSqlSha256':SQL_SHA,'containerId':CID,'database':'ontoo_resx_pre','dataState':data,'restoreAccountState':account,'integrity':summary,'runtimeIssued':False,'applicationReady':False,'automaticRetry':False}
  h['save'](ROOT/'execution.receipt.json',out);return out
 except Exception:
  # No exception text, SQL, password, row values or driver detail in public result.
  h['save'](ROOT/'failure.receipt.json',{'phase':phase,'databaseState':db,'restoreAccountState':account,'dataState':data,'automaticRetry':False})
  raise ValueError('RESX_PRE_RESTORE_UNCONFIRMED_PRESERVE_STATE') from None

def execute(value):
 module,custody,c,h,raw,model=enroll(value)
 ROOT.mkdir(mode=0o700)
 h['save'](ROOT/'execution.intent.json',{'source':SOURCE,'moduleSha256':MODULE_SHA,'stagingReceiptSha256':STAGING_SHA,'containerId':CID,'database':'ontoo_resx_pre','automaticRetry':False})
 return perform(module,custody,h,raw,model,lambda:custody['libraries'](value['libraries']))

if __name__=='__main__':
 try:
  require(sys.flags.isolated and os.geteuid()==0 and sys.argv[1:]==[MODE])
  packet=sys.stdin.buffer.read(1048577);require(len(packet)<=1048576)
  print(json.dumps(execute(json.loads(packet)),sort_keys=True))
 except Exception:
  print('RESX_PRE_RESTORE_UNCONFIRMED_PRESERVE_STATE_NO_RETRY',file=sys.stderr);raise SystemExit(1)
