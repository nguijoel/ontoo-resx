import copy,importlib.util,json,unittest
from pathlib import Path
p=Path(__file__).with_name('resx-pre-json-projection.py');s=importlib.util.spec_from_file_location('projection',p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class Tests(unittest.TestCase):
 def test_exact_native_projection_shape_only(self):
  r=m.validate(json.dumps(m.EXPECTED).encode());self.assertTrue(r['nativeJsonProjectionQualified']);self.assertFalse(r['databaseReady'])
 def test_boolean_string_count_and_quoted_nested_object_are_rejected(self):
  for k,v in [('predicateTrue',True),('scalarCount','2'),('nested',json.dumps(m.EXPECTED['cases']['nested'])),('nullObject',{})]:
   changed=copy.deepcopy(m.EXPECTED);changed['cases'][k]=v
   with self.assertRaises(ValueError):m.validate(json.dumps(changed).encode())
 def test_missing_extra_duplicate_nonfinite_or_wrong_engine_rejected(self):
  for raw in (b'{"x":1,"x":2}',b'{"x":NaN}',b'{}'):
   with self.assertRaises(ValueError):m.validate(raw)
  for k,v in [('version','11.8.4'),('rootLocal',True),('password','SYNTHETIC_PRIVATE')]:
   changed=copy.deepcopy(m.EXPECTED);changed[k]=v
   with self.assertRaises(ValueError):m.validate(json.dumps(changed).encode())
 def test_source_only_literal_derived_tables_and_identity_metadata(self):
  sql=Path(__file__).with_name('resx-pre-json-projection.sql').read_text()
  for forbidden in ('mysql.','information_schema.','CREATE ','ALTER ','DROP ','GRANT ','INSERT ','UPDATE ','DELETE ','FROM dbo.'):
   self.assertNotIn(forbidden,sql)
  self.assertIn('START TRANSACTION READ ONLY;',sql);self.assertTrue(sql.endswith('ROLLBACK;\n'))
if __name__=='__main__':unittest.main()
