"""Fixed PRE restore SQL/validation. No connector, file writes or arbitrary target."""
import hashlib,re
DB='ontoo_resx_pre'
ACCOUNT='ontoo_resx_pre_restore'
SQL_SHA='35877254af65ccab26ae94c8e2ffc48eba5773953a5ee72be18d29688fb4412b'
ROWS={'invite':1,'label':0,'label_terms_term':0,'label_translations_translation':0,'locale':563,'migrations':19,'plan':2,'project':14,'project_client':0,'project_locale':35,'project_user':15,'term':687,'translation':1524,'user':3}
def require(v):
 if not v:raise ValueError('RESX_PRE_RESTORE_REJECTED')
def sha(v):return hashlib.sha256(v).hexdigest()
def ident(v):
 require(isinstance(v,str) and re.fullmatch('[A-Za-z0-9_]{1,64}',v));return '`'+v+'`'
def inventory(sql):
 require(isinstance(sql,bytes) and len(sql)==436882 and sha(sql)==SQL_SHA)
 text=sql.decode('utf-8-sig');matches=list(re.finditer(r'CREATE TABLE `([A-Za-z0-9_]+)` \((.*?)\) ENGINE=InnoDB([^;]*);',text,re.S))
 require(len(matches)==14 and {m[1] for m in matches}==set(ROWS))
 require(not re.search(r'\b(?:CREATE\s+DATABASE|USE\s+`|SET\s+GLOBAL|SQL_LOG_BIN|DEFINER\s*=|INTO\s+OUTFILE|LOAD\s+DATA|CREATE\s+USER|GRANT\s+)',text,re.I))
 ddls={m[1]:m[0][:-1].encode() for m in matches};columns={m[1]:re.findall(r'^\s*`([A-Za-z0-9_]+)`\s+',m[2],re.M) for m in matches}
 require(sum(map(len,columns.values()))==77)
 edges=[]
 for m in matches:
  for f in re.finditer(r'CONSTRAINT `([A-Za-z0-9_]+)` FOREIGN KEY \(([^)]+)\) REFERENCES `([A-Za-z0-9_]+)` \(([^)]+)\)',m[2]):
   left=re.findall(r'`([A-Za-z0-9_]+)`',f[2]);right=re.findall(r'`([A-Za-z0-9_]+)`',f[4])
   require(left and len(left)==len(right) and f[3] in ROWS and all(c in columns[m[1]] for c in left) and all(c in columns[f[3]] for c in right))
   edges.append((f[1],m[1],left,f[3],right))
 require(len(edges)==16 and len({e[0] for e in edges})==16)
 require(len(re.findall(r'\bPRIMARY KEY\s*\(',text))==14 and len(re.findall(r'\bUNIQUE KEY\b',text))==7)
 allocators={m[1]:re.search(r'\bAUTO_INCREMENT=(\d+)',m[3])[1] for m in matches if re.search(r'\bAUTO_INCREMENT=(\d+)',m[3])}
 require(allocators=={'migrations':'20'})
 found=re.search(r'INSERT INTO `migrations` VALUES\s*(.*?);',text,re.S);require(found is not None)
 pattern=r"\(([0-9]+),([0-9]+),'([A-Za-z0-9_]+)'\)";ledger=re.findall(pattern,found[1]);require(len(ledger)==19 and not re.sub(pattern,'',found[1]).strip(' \t\r\n,'))
 hashes=[]
 for row in ledger:
  require(all(str(int(x))==x for x in row[:2]))
  hashes.append(sha('|'.join('V'+x.encode().hex().upper() for x in row).encode()))
 return {'ddls':ddls,'edges':edges,'allocators':allocators,'ledgerSha256':sha(''.join(sorted(hashes)).encode())}

PREFLIGHT_SQL=b"SET SESSION max_statement_time=30;\nSELECT 'RESX_PRE_PREFLIGHT_V1',SUBSTRING_INDEX(VERSION(),'-',1),CASE WHEN CURRENT_USER()='root@localhost' THEN '1' ELSE '0' END,CASE WHEN @@GLOBAL.character_set_server='utf8mb4' AND @@GLOBAL.collation_server='utf8mb4_bin' AND UPPER(CAST(@@GLOBAL.require_secure_transport AS CHAR)) IN ('ON','1') AND UPPER(CAST(@@GLOBAL.general_log AS CHAR)) IN ('OFF','0') AND UPPER(CAST(@@GLOBAL.slow_query_log AS CHAR)) IN ('OFF','0') AND UPPER(CAST(@@GLOBAL.log_bin AS CHAR)) IN ('OFF','0') AND UPPER(CAST(@@GLOBAL.local_infile AS CHAR)) IN ('OFF','0') AND @@GLOBAL.event_scheduler='OFF' THEN '1' ELSE '0' END,(SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME NOT IN ('information_schema','mysql','performance_schema','sys')),(SELECT COUNT(*) FROM mysql.global_priv WHERE LEFT(User,11)='ontoo_resx_'),(SELECT COUNT(*) FROM mysql.global_priv WHERE User='root' AND Host NOT IN ('localhost','127.0.0.1','::1'));\n"
def preflight(raw):require(raw.strip()==b'RESX_PRE_PREFLIGHT_V1\t11.8.3\t1\t1\t0\t0\t0')
CREATE_DATABASE_SQL=b'CREATE DATABASE `ontoo_resx_pre` CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;\n'
def create_restore_account(password):
 require(isinstance(password,str) and re.fullmatch('[a-f0-9]{64}',password))
 return ("CREATE USER 'ontoo_resx_pre_restore'@'localhost' IDENTIFIED BY '"+password+"' WITH MAX_USER_CONNECTIONS 1;\nGRANT SELECT,INSERT,CREATE,DROP,ALTER,INDEX,LOCK TABLES,REFERENCES ON `ontoo\\_resx\\_pre`.* TO 'ontoo_resx_pre_restore'@'localhost';\n").encode()
LOCK_RESTORE_SQL=b"ALTER USER 'ontoo_resx_pre_restore'@'localhost' ACCOUNT LOCK;\n"
RIGHTS_SQL=b"SELECT 'RESX_RESTORE_RIGHTS_V1',(SELECT COUNT(*) FROM mysql.global_priv WHERE User='ontoo_resx_pre_restore' AND Host='localhost' AND CAST(JSON_UNQUOTE(JSON_EXTRACT(Priv,'$.access')) AS UNSIGNED)=0),(SELECT COUNT(*) FROM mysql.db WHERE User='ontoo_resx_pre_restore' AND Host='localhost' AND HEX(Db)='6F6E746F6F5C5F726573785C5F707265' AND Select_priv='Y' AND Insert_priv='Y' AND Create_priv='Y' AND Drop_priv='Y' AND Alter_priv='Y' AND Index_priv='Y' AND Lock_tables_priv='Y' AND References_priv='Y' AND Update_priv='N' AND Delete_priv='N' AND Grant_priv='N' AND Execute_priv='N' AND Create_routine_priv='N' AND Alter_routine_priv='N' AND Event_priv='N' AND Trigger_priv='N'),(SELECT COUNT(*) FROM mysql.db WHERE User='ontoo_resx_pre_restore'),(SELECT COUNT(*) FROM mysql.roles_mapping WHERE User='ontoo_resx_pre_restore' OR Role='ontoo_resx_pre_restore');\n"
def rights(raw):require(raw.strip()==b'RESX_RESTORE_RIGHTS_V1\t1\t1\t1\t0')
def import_notes(raw):
 require(isinstance(raw,bytes) and len(raw)<=32768)
 for line in raw.splitlines():
  if line.strip():require(re.fullmatch(rb'Note \(Code 1051\): [^\r\n]*',line) is not None)
def postflight_sql(model):
 lines=["SET SESSION max_statement_time=300; SET SESSION group_concat_max_len=8192; SET SESSION time_zone='+00:00'; START TRANSACTION READ ONLY;"]
 lines.append("SELECT 'S',(SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='ontoo_resx_pre' AND TABLE_TYPE='BASE TABLE'),(SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='ontoo_resx_pre'),(SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA='ontoo_resx_pre' AND CONSTRAINT_TYPE='PRIMARY KEY'),(SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA='ontoo_resx_pre' AND CONSTRAINT_TYPE='UNIQUE'),(SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA='ontoo_resx_pre' AND CONSTRAINT_TYPE='FOREIGN KEY'),(SELECT COUNT(*) FROM information_schema.VIEWS WHERE TABLE_SCHEMA='ontoo_resx_pre'),(SELECT COUNT(*) FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA='ontoo_resx_pre'),(SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA='ontoo_resx_pre'),(SELECT COUNT(*) FROM information_schema.EVENTS WHERE EVENT_SCHEMA='ontoo_resx_pre'),(SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='ontoo_resx_pre' AND (ENGINE<>'InnoDB' OR TABLE_COLLATION<>'utf8mb4_bin'));")
 for table in sorted(ROWS):lines.append("SELECT 'T','"+table+"',COUNT(*) FROM "+ident(DB)+'.'+ident(table)+';')
 for name,child,left,parent,right in sorted(model['edges']):
  join=' AND '.join('c.'+ident(a)+'=p.'+ident(b) for a,b in zip(left,right));nonnull=' AND '.join('c.'+ident(a)+' IS NOT NULL' for a in left)
  lines.append("SELECT 'F','"+name+"',COUNT(*) FROM "+ident(DB)+'.'+ident(child)+' c LEFT JOIN '+ident(DB)+'.'+ident(parent)+' p ON '+join+' WHERE '+nonnull+' AND p.'+ident(right[0])+' IS NULL;')
 lines.append("SELECT 'A',COALESCE(CAST(AUTO_INCREMENT AS CHAR),'NULL') FROM information_schema.TABLES WHERE TABLE_SCHEMA='ontoo_resx_pre' AND TABLE_NAME='migrations';")
 row="CONCAT('V',HEX(CAST(id AS BINARY)),'|V',HEX(CAST(`timestamp` AS BINARY)),'|V',HEX(CAST(name AS BINARY)))"
 lines.append("SELECT 'M',COUNT(*),SHA2(GROUP_CONCAT(SHA2("+row+",256) ORDER BY SHA2("+row+",256) SEPARATOR ''),256) FROM `ontoo_resx_pre`.`migrations`;")
 lines.append('ROLLBACK;');return ('\n'.join(lines)+'\n').encode()
def postflight(raw,model):
 rows=[line.decode('ascii').split('\t') for line in raw.splitlines()];require(len(rows)==33)
 require(rows[0]==['S','14','77','14','7','16','0','0','0','0','0'])
 for actual,(name,count) in zip(rows[1:15],sorted(ROWS.items())):require(actual==['T',name,str(count)])
 for actual,edge in zip(rows[15:31],sorted(model['edges'])):require(actual==['F',edge[0],'0'])
 require(rows[31]==['A','20'] and rows[32]==['M','19',model['ledgerSha256']])
 return {'tables':14,'columns':77,'rows':2863,'foreignKeysChecked':16,'orphans':0,'migrations':19,'migrationsSha256':model['ledgerSha256'],'identityNextValue':'20'}
def show_create_sql(model):return ('\n'.join('SHOW CREATE TABLE '+ident(DB)+'.'+ident(t)+';' for t in sorted(model['ddls']))+'\n').encode()
def show_create(raw,model):require(raw==b''.join(t.encode()+b'\t'+model['ddls'][t]+b'\n' for t in sorted(model['ddls'])))
CHECK_SQL=('CHECK TABLE '+','.join(ident(DB)+'.'+ident(t) for t in sorted(ROWS))+' EXTENDED;\n').encode()
def check_tables(raw):
 rows=[x.decode('ascii').split('\t') for x in raw.splitlines()]
 require(len(rows)==14 and rows==[[DB+'.'+t,'check','status','OK'] for t in sorted(ROWS)])

RUNTIME_PREFLIGHT_SQL=b"SELECT 'RESX_RUNTIME_PREFLIGHT_V1',(SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='ontoo_resx_pre'),(SELECT COUNT(*) FROM mysql.global_priv WHERE User='ontoo_resx_pre_runtime');\n"
def runtime_preflight(raw):require(raw.strip()==b'RESX_RUNTIME_PREFLIGHT_V1\t1\t0')
def runtime_statements(password):
 require(isinstance(password,str) and re.fullmatch('[a-f0-9]{64}',password))
 create=("CREATE USER 'ontoo_resx_pre_runtime'@'172.21.0.3' IDENTIFIED BY '"+password+"' REQUIRE SSL WITH MAX_USER_CONNECTIONS 10 ACCOUNT LOCK;\n").encode()
 grants=''.join('GRANT SELECT,INSERT,UPDATE,DELETE ON '+ident(DB)+'.'+ident(t)+" TO 'ontoo_resx_pre_runtime'@'172.21.0.3';\n" for t in sorted(ROWS) if t!='migrations')
 grants+='GRANT SELECT ON `ontoo_resx_pre`.`migrations` TO \'ontoo_resx_pre_runtime\'@\'172.21.0.3\';\n'
 return {'create':create,'grant':grants.encode(),'unlock':b"ALTER USER 'ontoo_resx_pre_runtime'@'172.21.0.3' ACCOUNT UNLOCK;\n"}
RUNTIME_RIGHTS_SQL=b"SELECT 'RESX_RUNTIME_RIGHTS_V1',(SELECT COUNT(*) FROM mysql.global_priv g JOIN mysql.user u ON u.User=g.User AND u.Host=g.Host WHERE g.User='ontoo_resx_pre_runtime' AND g.Host='172.21.0.3' AND JSON_UNQUOTE(JSON_EXTRACT(g.Priv,'$.account_locked'))='false' AND CAST(JSON_UNQUOTE(JSON_EXTRACT(g.Priv,'$.access')) AS UNSIGNED)=0 AND u.ssl_type='ANY' AND u.max_user_connections=10 AND u.authentication_string<>''),(SELECT COUNT(*) FROM mysql.global_priv WHERE User='ontoo_resx_pre_runtime'),(SELECT COUNT(*) FROM mysql.db WHERE User='ontoo_resx_pre_runtime'),(SELECT COUNT(*) FROM mysql.tables_priv WHERE User='ontoo_resx_pre_runtime' AND Host='172.21.0.3' AND Db='ontoo_resx_pre'),(SELECT COUNT(*) FROM mysql.columns_priv WHERE User='ontoo_resx_pre_runtime')+(SELECT COUNT(*) FROM mysql.procs_priv WHERE User='ontoo_resx_pre_runtime')+(SELECT COUNT(*) FROM mysql.roles_mapping WHERE User='ontoo_resx_pre_runtime' OR Role='ontoo_resx_pre_runtime');\nSELECT 'P',Table_name,CAST(Table_priv AS CHAR) FROM mysql.tables_priv WHERE User='ontoo_resx_pre_runtime' AND Host='172.21.0.3' AND Db='ontoo_resx_pre' ORDER BY Table_name;\n"
def runtime_rights(raw):
 rows=[x.decode('ascii').split('\t') for x in raw.splitlines()]
 require(len(rows)==15 and rows[0]==['RESX_RUNTIME_RIGHTS_V1','1','1','0','14','0'])
 for actual,table in zip(rows[1:],sorted(ROWS)):
  require(len(actual)==3 and actual[:2]==['P',table])
  require(set(actual[2].lower().split(','))==({'select'} if table=='migrations' else {'select','insert','update','delete'}))
