import importlib.util,unittest,zipfile
from pathlib import Path
p=Path(__file__).with_name('resx-pre-restore.py');s=importlib.util.spec_from_file_location('restore',p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class Tests(unittest.TestCase):
 def model(self):
  with zipfile.ZipFile(r'D:/Downloads/ontoo_m_tr_2026-11-22_23-35-45.sql.zip') as z:return m.inventory(z.read(z.infolist()[0]))
 def test_actual_source_inventory_and_independent_ledger_baseline(self):
  model=self.model();self.assertEqual(len(model['ddls']),14);self.assertEqual(len(model['edges']),16);self.assertEqual(model['allocators'],{'migrations':'20'});self.assertEqual(len(model['ledgerSha256']),64)
  m.show_create(b''.join(t.encode()+b'\t'+model['ddls'][t]+b'\n' for t in sorted(model['ddls'])),model)
 def test_exact_preflight_rights_and_unknown_existing_resources_reject(self):
  m.preflight(b'RESX_PRE_PREFLIGHT_V1\t11.8.3\t1\t1\t0\t0\t0\n');m.rights(b'RESX_RESTORE_RIGHTS_V1\t1\t1\t1\t0\n')
  for raw in (b'',b'RESX_PRE_PREFLIGHT_V1\t11.8.3\t1\t1\t1\t0\t0'):
   with self.assertRaises(ValueError):m.preflight(raw)
  with self.assertRaises(ValueError):m.create_restore_account("unsafe'password")
  sql=m.create_restore_account('a'*64);self.assertIn(b'`ontoo\\_resx\\_pre`.*',sql);self.assertNotIn(b'GRANT OPTION',sql);self.assertNotIn(b"'%'",sql)
 def test_orphan_counts_ledger_allocator_and_full_ddl_must_match(self):
  model=self.model();rows=[['S','14','77','14','7','16','0','0','0','0','0']]+[['T',t,str(n)] for t,n in sorted(m.ROWS.items())]+[['F',e[0],'0'] for e in sorted(model['edges'])]+[['A','20'],['M','19',model['ledgerSha256']]]
  raw=('\n'.join('\t'.join(x) for x in rows)+'\n').encode();self.assertEqual(m.postflight(raw,model)['rows'],2863)
  with self.assertRaises(ValueError):m.postflight(raw.replace(b'\t20\n',b'\t21\n'),model)
  with self.assertRaises(ValueError):m.show_create(b'changed',model)
  for raw in (b'Warning (Code 1265): private\n',b'unknown output\n'):
   with self.assertRaises(ValueError):m.import_notes(raw)
  m.import_notes(b'Note (Code 1051): missing initial table\n')
 def test_hosted_runtime_is_exact_ip_and_application_tables_only_unlock_last(self):
  sql=m.runtime_statements('b'*64)
  self.assertIn(b"@'172.21.0.3'",sql['create']);self.assertIn(b'REQUIRE SSL',sql['create']);self.assertIn(b'ACCOUNT LOCK',sql['create'])
  self.assertEqual(sql['grant'].count(b'GRANT SELECT,INSERT,UPDATE,DELETE'),13)
  self.assertIn(b'GRANT SELECT ON `ontoo_resx_pre`.`migrations`',sql['grant']);self.assertNotIn(b'GRANT OPTION',sql['grant'])
  self.assertEqual(sql['unlock'],b"ALTER USER 'ontoo_resx_pre_runtime'@'172.21.0.3' ACCOUNT UNLOCK;\n")
  m.runtime_preflight(b'RESX_RUNTIME_PREFLIGHT_V1\t1\t0\n')
  with self.assertRaises(ValueError):m.runtime_preflight(b'RESX_RUNTIME_PREFLIGHT_V1\t1\t1\n')
if __name__=='__main__':unittest.main()
