"""Separate fixed PRE runtime issuance after accepted restore; never starts app."""
import base64,hashlib,json,os,secrets,sys
from pathlib import Path
ROOT=Path('/var/lib/ontoo/resx-pre-runtime-run01')
MODE='issue-dba-resx-pre-runtime-fixed'
PERFORMER_SHA='27776c2db5666efab055b77f9c567f29c8214b77e7b21e31c54dd2519a0f8569'
RESTORE_SHA='4ad4c4fdffeee20baf08d958975b7af30900a0e82991f9ade87f733a490b850b'
RESTORE_ROOT=Path('/var/lib/ontoo/resx-pre-restore-run01')

def require(v):
 if not v:raise ValueError('RESX_PRE_RUNTIME_REJECTED')
def sha(b):return hashlib.sha256(b).hexdigest()

def enroll(value):
 require(isinstance(value,dict) and set(value)=={'performer','module','custody','libraries'})
 raw=base64.b64decode(value['performer'],validate=True);require(sha(raw)==PERFORMER_SHA)
 p={'__name__':'sealed_restore_code'};exec(compile(raw,'<sealed-restore-code>','exec'),p)
 module,custody,c,h,source,model=p['enroll']({k:value[k] for k in ('module','custody','libraries')})
 receipt=json.loads(c['read'](RESTORE_ROOT/'execution.receipt.json',RESTORE_SHA))
 require(receipt['restored'] is True and receipt['dataState']=='IMPORTED_VERIFIED' and receipt['restoreAccountState']=='LOCKED' and receipt['runtimeIssued'] is False and receipt['containerId']==p['CID'] and receipt['source']==p['SOURCE'] and receipt['moduleSha256']==p['MODULE_SHA'] and receipt['sourceSqlSha256']==p['SQL_SHA'] and receipt['stagingReceiptSha256']==p['STAGING_SHA'])
 require(receipt['integrity']=={'tables':14,'columns':77,'rows':2863,'foreignKeysChecked':16,'orphans':0,'migrations':19,'migrationsSha256':model['ledgerSha256'],'identityNextValue':'20'})
 # Rebind only capture destination. No restore/bootstrap/native function invoked.
 p['native'].__globals__['ROOT']=ROOT
 return p,module,custody,c,h

def perform(p,module,custody,h,verify,password_factory=lambda:secrets.token_hex(32)):
 phase='RUNTIME_PREFLIGHT';state='NOT_STARTED';credential='NOT_STARTED'
 native=lambda prefix,sql,secret=None:p['native'](custody,h,prefix,sql,secret=secret)
 try:
  module['runtime_preflight'](native('preflight',module['RUNTIME_PREFLIGHT_SQL']))
  phase='CREATE_PRIVATE_CREDENTIAL';password=password_factory()
  # New root-only input for Infrastructure's protected profile constructor.
  # The credential is never returned, placed in argv/env or printed.
  h['save'](ROOT/'runtime.password.private',password.encode('ascii'),0o400);credential='CREATED'
  statements=module['runtime_statements'](password)
  phase='CREATE_LOCKED_RUNTIME';state='UNKNOWN'
  require(native('account',statements['create'],secret=password)==b'');state='LOCKED_CREATED'
  phase='GRANT_RUNTIME_TABLES'
  require(native('database',statements['grant'])==b'');state='LOCKED_GRANTED'
  phase='VERIFY_LOCKED_RUNTIME_RIGHTS'
  locked_sql=module['RUNTIME_RIGHTS_SQL'].replace(b"'$.account_locked'))='false'",b"'$.account_locked'))='true'")
  require(locked_sql!=module['RUNTIME_RIGHTS_SQL'])
  module['runtime_rights'](native('rights',locked_sql))
  phase='UNLOCK_RUNTIME';state='UNLOCK_UNKNOWN'
  require(native('lock',statements['unlock'])==b'');state='UNLOCKED_UNVERIFIED'
  password=None;statements=None
  phase='VERIFY_RUNTIME_RIGHTS';module['runtime_rights'](native('postflight',module['RUNTIME_RIGHTS_SQL']));state='ISSUED_VERIFIED'
  phase='FINAL_PHYSICAL_VERIFY';verify()
  out={'runtimeIssued':True,'database':'ontoo_resx_pre','containerId':p['CID'],'account':'ontoo_resx_pre_runtime@172.21.0.3','requiresSsl':True,'applicationTablesCrud':13,'migrationTableSelectOnly':True,'globalPrivileges':0,'databasePrivileges':0,'ddlPrivileges':0,'restoreReceiptSha256':RESTORE_SHA,'credentialReference':'/var/lib/ontoo/resx-pre-runtime-run01/runtime.password.private','credentialMode':'0400/root','runtimeState':state,'applicationReady':False,'automaticRetry':False}
  h['save'](ROOT/'runtime.receipt.json',out);return out
 except Exception:
  h['save'](ROOT/'failure.receipt.json',{'phase':phase,'runtimeState':state,'credentialState':credential,'automaticRetry':False})
  raise ValueError('RESX_PRE_RUNTIME_UNCONFIRMED_PRESERVE_STATE') from None

def execute(value):
 p,module,custody,c,h=enroll(value)
 ROOT.mkdir(mode=0o700)
 h['save'](ROOT/'execution.intent.json',{'restoreReceiptSha256':RESTORE_SHA,'performerSha256':PERFORMER_SHA,'database':'ontoo_resx_pre','account':'ontoo_resx_pre_runtime@172.21.0.3','automaticRetry':False})
 return perform(p,module,custody,h,lambda:custody['libraries'](value['libraries']))

if __name__=='__main__':
 try:
  require(sys.flags.isolated and os.geteuid()==0 and sys.argv[1:]==[MODE])
  packet=sys.stdin.buffer.read(1048577);require(len(packet)<=1048576)
  print(json.dumps(execute(json.loads(packet)),sort_keys=True))
 except Exception:
  print('RESX_PRE_RUNTIME_UNCONFIRMED_PRESERVE_STATE_NO_RETRY',file=sys.stderr);raise SystemExit(1)
