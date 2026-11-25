import runpy,unittest
from pathlib import Path
n=runpy.run_path(str(Path(__file__).with_name('resx-export-context.py')))
class Tests(unittest.TestCase):
 def test_globs_allow_root_and_nested_sources_but_never_private_inputs(self):
  m={'include':['api/src/**/*.ts','package.json','api/**'],'exclude':['**/.env','**/*.pem','**/node_modules/**']}
  self.assertTrue(n['selected']('api/src/app.ts',m));self.assertTrue(n['selected']('api/src/a/app.ts',m))
  for name in ['api/.env','api/key.pem','api/node_modules/a.js']:self.assertFalse(n['selected'](name,m))
 def test_output_paths_and_globs_fail_closed(self):
  for value in ['../a','a/../b','/a','a\\b']:
   with self.assertRaises(ValueError):n['selected'](value,{'include':['**'],'exclude':[]})
  for value in ['../**','/a','a\\b']:
   with self.assertRaises(ValueError):n['pattern'](value)
if __name__=='__main__':unittest.main()
