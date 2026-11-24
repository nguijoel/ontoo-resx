"""Strict public literal-fixture validator. No connector or source metadata acceptance."""
import json
EXPECTED={'version':'11.8.3','rootLocal':1,'cases':{'predicateTrue':1,'predicateFalse':0,'nativeOn':1,'nativeOff':0,'nativeOne':1,'nativeZero':0,'unknownFlag':None,'scalarCount':2,'emptyCount':0,'scalarText':1,'nested':{'host':'172.21.0.1','locked':1,'accessZero':1,'requiresSsl':1,'noPassword':1,'noAlternateAuth':1,'plugin':'mysql_native_password','maxUserConnections':1},'nullObject':None}}
def reject():raise ValueError('RESX_JSON_PROJECTION_REJECTED')
def exact(actual,expected):
 if type(actual) is not type(expected):reject()
 if isinstance(expected,dict):
  if set(actual)!=set(expected):reject()
  for k,v in expected.items():exact(actual[k],v)
 elif actual!=expected:reject()
def validate(raw):
 if not isinstance(raw,bytes) or len(raw)>16384:reject()
 def pairs(items):
  out={}
  for k,v in items:
   if k in out:reject()
   out[k]=v
  return out
 def invalid(_):reject()
 value=json.loads(raw,object_pairs_hook=pairs,parse_constant=invalid);exact(value,EXPECTED)
 return {'nativeJsonProjectionQualified':True,'version':'11.8.3','literalCases':12,'rootLocal':True,'accountSqlExecuted':False,'applicationDataRead':False,'databaseReady':False,'applicationReady':False}
