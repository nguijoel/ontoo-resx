from pathlib import Path
import importlib.util,json,unittest
p=Path(__file__).with_name('resx-pre-probe-validate.py');s=importlib.util.spec_from_file_location('probe',p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
def baseline():
 return {'version':'11.8.3','mariadbVendor':1,'rootLocal':1,'charset':'utf8mb4','collation':'utf8mb4_bin','haveSsl':'YES','secureTransport':1,'tlsVersions':'TLSv1.2,TLSv1.3','sslCaConfigured':1,'sslCertConfigured':1,'sslKeyConfigured':1,'generalLog':0,'slowLog':0,'binaryLog':0,'localInfile':0,'eventScheduler':'OFF','schemaNames':'information_schema,mysql,performance_schema,sys','nonlocalRootAccounts':0,'otherResxAccounts':0,'accountCountExcludingProbe':4,'accountFingerprintExcludingProbe':'a'*64,'probeAccountCount':0,'probe':None,'probeGrantRows':0,'probeRoleRows':0}
def raw(v):return json.dumps(v).encode()
class Tests(unittest.TestCase):
 def test_before_rejects_existing_accounts_or_wrong_target_policy(self):
  m.validate(raw(baseline()))
  for k,v in [('probeAccountCount',1),('otherResxAccounts',1),('nonlocalRootAccounts',1),('secureTransport',0),('generalLog',1),('haveSsl','DISABLED'),('version','11.8.4'),('schemaNames','information_schema,mysql,ontoo_resx_pre,performance_schema,sys')]:
   b=baseline();b[k]=v
   with self.assertRaises(ValueError):m.validate(raw(b))
 def test_after_requires_locked_host_specific_no_privilege_identity_and_unchanged_baseline(self):
  b=baseline();v=baseline();v.update(probeAccountCount=1,probe={'host':'172.21.0.1','locked':1,'accessZero':1,'requiresSsl':1,'noPassword':1,'plugin':'mysql_native_password','noAlternateAuth':1,'maxUserConnections':1})
  m.validate(raw(v),True,b)
  for k,x in [('host','%'),('locked',0),('requiresSsl',0),('accessZero',0),('noPassword',0),('noAlternateAuth',0)]:
   changed=json.loads(raw(v));changed['probe'][k]=x
   with self.assertRaises(ValueError):m.validate(raw(changed),True,b)
  changed=dict(v);changed['accountFingerprintExcludingProbe']='b'*64
  with self.assertRaises(ValueError):m.validate(raw(changed),True,b)
 def test_malformed_unknown_boolean_or_private_fields_fail_closed(self):
  for value in (b'{"x":1,"x":2}',b'{"x":NaN}'):
   with self.assertRaises(ValueError):m.strict(value)
  for k,value in [('secureTransport',True),('accountCountExcludingProbe',True),('password','SYNTHETIC_PRIVATE')]:
   b=baseline();b[k]=value
   with self.assertRaises(ValueError):m.validate(raw(b))
 def test_sql_is_fixed_create_only_no_adoption_unlock_or_privilege_grants(self):
  sql=Path(__file__).with_name('resx-pre-locked-probe.sql').read_text()
  self.assertEqual(sql,"CREATE USER 'ontoo_resx_pre_probe'@'172.21.0.1' REQUIRE SSL WITH MAX_USER_CONNECTIONS 1 ACCOUNT LOCK;\n")
if __name__=='__main__':unittest.main()
