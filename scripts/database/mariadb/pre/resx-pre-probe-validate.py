"""Pure validation of fixed socket metadata; no connector, secret or SQL execution."""
import hashlib
import json
import re

FIELDS={'version','mariadbVendor','rootLocal','charset','collation','haveSsl','secureTransport','tlsVersions','sslCaConfigured','sslCertConfigured','sslKeyConfigured','generalLog','slowLog','binaryLog','localInfile','eventScheduler','schemaNames','nonlocalRootAccounts','otherResxAccounts','accountCountExcludingProbe','accountFingerprintExcludingProbe','probeAccountCount','probe','probeGrantRows','probeRoleRows'}
def require(value):
 if not value:raise ValueError('RESX_PROBE_METADATA_REJECTED')
def strict(raw):
 def pairs(items):
  d={}
  for k,v in items:
   if k in d:raise ValueError('RESX_PROBE_DUPLICATE_KEY')
   d[k]=v
  return d
 def invalid(_):raise ValueError('RESX_PROBE_NONFINITE')
 require(isinstance(raw,bytes) and len(raw)<=32768)
 return json.loads(raw,object_pairs_hook=pairs,parse_constant=invalid)
def validate(raw,after=False,before=None):
 require(type(after) is bool)
 v=strict(raw);require(isinstance(v,dict) and set(v)==FIELDS)
 require(v['version']=='11.8.3' and v['charset']=='utf8mb4' and v['collation']=='utf8mb4_bin' and v['haveSsl']=='YES' and v['eventScheduler']=='OFF')
 require(isinstance(v['tlsVersions'],str) and set(v['tlsVersions'].split(','))=={'TLSv1.2','TLSv1.3'})
 for k in ('mariadbVendor','rootLocal','secureTransport','sslCaConfigured','sslCertConfigured','sslKeyConfigured'):require(type(v[k]) is int and v[k]==1)
 for k in ('generalLog','slowLog','binaryLog','localInfile','nonlocalRootAccounts','otherResxAccounts','probeGrantRows','probeRoleRows'):require(type(v[k]) is int and v[k]==0)
 require(v['schemaNames']=='information_schema,mysql,performance_schema,sys')
 require(type(v['accountCountExcludingProbe']) is int and 1<=v['accountCountExcludingProbe']<=32)
 require(isinstance(v['accountFingerprintExcludingProbe'],str) and re.fullmatch('[a-f0-9]{64}',v['accountFingerprintExcludingProbe']))
 require(type(v['probeAccountCount']) is int and v['probeAccountCount']==int(after))
 if not after:require(v['probe'] is None and before is None)
 else:
  p=v['probe'];require(isinstance(p,dict) and set(p)=={'host','locked','accessZero','requiresSsl','noPassword','plugin','noAlternateAuth','maxUserConnections'})
  require(p['host']=='172.21.0.1' and p['plugin']=='mysql_native_password')
  require(type(p['maxUserConnections']) is int and p['maxUserConnections']==1)
  for k in ('locked','accessZero','requiresSsl','noPassword','noAlternateAuth'):require(type(p[k]) is int and p[k]==1)
  require(isinstance(before,dict) and set(before)==FIELDS)
  require({k:x for k,x in v.items() if k not in {'probeAccountCount','probe'}}=={k:x for k,x in before.items() if k not in {'probeAccountCount','probe'}})
 return v
