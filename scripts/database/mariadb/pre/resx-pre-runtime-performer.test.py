import runpy,unittest
from pathlib import Path
BASE=Path(__file__).parent
n=runpy.run_path(str(BASE/'resx-pre-runtime-performer.py'))

class Tests(unittest.TestCase):
 def run_case(self,fail=None):
  events=[];saved={};p={'CID':'fixed-cid'}
  m={'RUNTIME_PREFLIGHT_SQL':b'preflight','RUNTIME_RIGHTS_SQL':b"'$.account_locked'))='false'"}
  def validate(raw):
   events.append('validate')
   if fail=='validate' and 'rights' in events:raise ValueError('private detail')
  m['runtime_preflight']=validate;m['runtime_rights']=validate
  m['runtime_statements']=lambda pw:{'create':b'create','grant':b'grant','unlock':b'unlock'}
  def native(c,h,prefix,sql,secret=None):
   events.append(prefix)
   if prefix=='account':self.assertEqual(secret,'b'*64)
   if prefix=='rights':self.assertIn(b"='true'",sql)
   if prefix=='postflight':self.assertIn(b"='false'",sql)
   if prefix==fail:raise ValueError('private detail')
   return b''
  p['native']=native
  def save(path,value,mode=0o600):
   events.append('save:'+path.name);saved[path.name]=value
   if path.name=='runtime.password.private':self.assertEqual(mode,0o400)
  h={'save':save}
  def verify():
   events.append('physical')
   if fail=='physical':raise ValueError('private detail')
  try:return n['perform'](p,m,{},h,verify,lambda:'b'*64),events,saved
  except ValueError as e:
   self.assertNotIn('private detail',str(e));return None,events,saved

 def test_success_grants_and_locked_proof_precede_unlock(self):
  out,e,s=self.run_case()
  self.assertLess(e.index('database'),e.index('rights'));self.assertLess(e.index('rights'),e.index('lock'))
  self.assertLess(e.index('postflight'),e.index('physical'))
  self.assertTrue(out['runtimeIssued']);self.assertFalse(out['applicationReady'])
  self.assertNotIn('b'*64,str(out));self.assertIn('runtime.receipt.json',s)

 def test_preflight_failure_no_password_or_account(self):
  _,e,s=self.run_case('preflight')
  self.assertNotIn('runtime.password.private',s);self.assertNotIn('account',e)

 def test_create_failure_unknown_no_grants(self):
  _,e,s=self.run_case('account')
  self.assertNotIn('database',e);self.assertEqual(s['failure.receipt.json']['runtimeState'],'UNKNOWN')

 def test_locked_proof_failure_never_unlocks(self):
  _,e,s=self.run_case('validate')
  self.assertNotIn('lock',e);self.assertEqual(s['failure.receipt.json']['runtimeState'],'LOCKED_GRANTED')

 def test_unlock_failure_unknown_no_success(self):
  _,e,s=self.run_case('lock')
  self.assertEqual(s['failure.receipt.json']['runtimeState'],'UNLOCK_UNKNOWN')
  self.assertNotIn('runtime.receipt.json',s)

 def test_final_physical_failure_preserves_issued_state(self):
  _,e,s=self.run_case('physical')
  self.assertEqual(s['failure.receipt.json']['runtimeState'],'ISSUED_VERIFIED')
  self.assertNotIn('runtime.receipt.json',s)

 def test_real_sealed_sql_locked_variant_is_one_substitution(self):
  m=runpy.run_path(str(BASE/'resx-pre-restore.py'))
  a=m['RUNTIME_RIGHTS_SQL'];old=b"'$.account_locked'))='false'";new=b"'$.account_locked'))='true'"
  self.assertEqual(a.count(old),1);self.assertEqual(a.replace(old,new).replace(new,old),a)

if __name__=='__main__':unittest.main()
