import base64,hashlib,runpy,unittest
from pathlib import Path
from unittest.mock import patch

BASE=Path(__file__).parent
n=runpy.run_path(str(BASE/'resx-pre-restore-performer.py'))

class Tests(unittest.TestCase):
 def fixture(self,fail=None):
  calls=[];saved={};m={'PREFLIGHT_SQL':b'p','CREATE_DATABASE_SQL':b'd','RIGHTS_SQL':b'r','LOCK_RESTORE_SQL':b'l','CHECK_SQL':b'c'}
  for name in ('preflight','rights','import_notes','show_create','check_tables'):
   def validate(*args,name=name):
    calls.append('validate:'+name)
    if fail==name:raise ValueError('PRIVATE_SYNTHETIC_SECRET')
   m[name]=validate
  m['create_restore_account']=lambda pw:b'private-account'
  m['postflight_sql']=lambda model:b'post'
  m['show_create_sql']=lambda model:b'ddl'
  m['postflight']=lambda raw,model:{'tables':14,'rows':2863}
  def native(c,h,prefix,sql,restore=False):
   calls.append(prefix)
   if fail==prefix:raise ValueError('PRIVATE_SYNTHETIC_SECRET')
   if prefix=='import':self.assertEqual(sql,b'EXACT_SOURCE');self.assertTrue(restore)
   return b''
  def save(path,value):saved[path.name]=value
  def verify():
   calls.append('final')
   if fail=='final':raise ValueError('PRIVATE_SYNTHETIC_SECRET')
  return m,{'save':save},native,verify,calls,saved

 def run_case(self,fail=None):
  m,h,native,verify,calls,saved=self.fixture(fail)
  g=n['perform'].__globals__
  with patch.dict(g,{'native':native}):
   try:
    result=n['perform'](m,{},h,b'EXACT_SOURCE',{},verify,lambda p:calls.append('credential'),lambda:'a'*64)
    return result,calls,saved
   except ValueError as e:
    self.assertNotIn('PRIVATE_SYNTHETIC_SECRET',str(e));return None,calls,saved

 def test_success_order_and_runtime_not_issued(self):
  out,calls,saved=self.run_case()
  self.assertEqual([x for x in calls if not x.startswith('validate:')],['preflight','database','credential','account','rights','import','lock','postflight','ddl','check','final'])
  self.assertEqual(out['dataState'],'IMPORTED_VERIFIED');self.assertFalse(out['runtimeIssued'])
  self.assertIn('execution.receipt.json',saved);self.assertNotIn('failure.receipt.json',saved)

 def test_preflight_rejection_has_no_database_or_credential(self):
  _,calls,saved=self.run_case('preflight')
  self.assertEqual(calls,['preflight']);self.assertEqual(saved['failure.receipt.json']['databaseState'],'NOT_STARTED')

 def test_import_failure_unknown_no_lock_or_retry(self):
  _,calls,saved=self.run_case('import')
  self.assertEqual(calls.count('import'),1);self.assertNotIn('lock',calls)
  self.assertEqual(saved['failure.receipt.json']['dataState'],'UNKNOWN')

 def test_postimport_ddl_mismatch_preserves_imported_truth(self):
  _,calls,saved=self.run_case('show_create')
  self.assertEqual(saved['failure.receipt.json']['dataState'],'IMPORTED_UNVERIFIED')
  self.assertEqual(saved['failure.receipt.json']['restoreAccountState'],'LOCKED')
  self.assertNotIn('check',calls);self.assertNotIn('execution.receipt.json',saved)

 def test_final_guard_failure_keeps_verified_data_no_success(self):
  _,calls,saved=self.run_case('final')
  self.assertEqual(saved['failure.receipt.json']['dataState'],'IMPORTED_VERIFIED')
  self.assertNotIn('execution.receipt.json',saved)

 def test_native_fixed_identity_input_and_preserved_failure(self):
  seen=[];saved={}
  def capture(args,data,env,seconds):
   seen.append((args,data,seconds))
   return {'stdout':b'PRIVATE','stderr':b'PRIVATE_ERROR','exitCode':1,'timeout':False,'outputOverflow':False,'captureComplete':True,'captureError':False}
  with self.assertRaises(ValueError):n['native']({'bounded_capture':capture},{'ENV':{},'save':lambda p,b:saved.setdefault(p.name,b)},'import',b'EXACT_SOURCE',True)
  args,data,seconds=seen[0]
  self.assertIn('--defaults-file=/run/secrets/restore-pre-run01.cnf',args)
  self.assertIn('--database=ontoo_resx_pre',args);self.assertIn('--show-warnings',args)
  self.assertNotIn('--force',args);self.assertNotIn('--password',str(args))
  self.assertEqual(seconds,615);self.assertEqual(data,b'EXACT_SOURCE')
  self.assertEqual(saved['import.stderr.private'],b'PRIVATE_ERROR')

 def test_module_and_guard_tampering_rejected_before_execution(self):
  raw=(BASE/'resx-pre-restore.py').read_bytes()
  self.assertEqual(hashlib.sha256(raw).hexdigest(),n['MODULE_SHA'])
  self.assertEqual(n['load'](raw,n['MODULE_SHA'],'test_module')['DB'],'ontoo_resx_pre')
  with self.assertRaises(ValueError):n['load'](raw+b'\n',n['MODULE_SHA'],'test_module')

if __name__=='__main__':unittest.main()
