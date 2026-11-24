SET SESSION max_statement_time=30;
SET SESSION group_concat_max_len=8192;
START TRANSACTION READ ONLY;
SELECT JSON_OBJECT(
 'version',SUBSTRING_INDEX(VERSION(),'-',1),
 'mariadbVendor',LOCATE('MariaDB',VERSION())>0,
 'rootLocal',CURRENT_USER()='root@localhost',
 'charset',@@GLOBAL.character_set_server,
 'collation',@@GLOBAL.collation_server,
 'haveSsl',@@GLOBAL.have_ssl,
 'secureTransport',@@GLOBAL.require_secure_transport,
 'tlsVersions',@@GLOBAL.tls_version,
 'sslCaConfigured',@@GLOBAL.ssl_ca='/run/tls/ca.pem',
 'sslCertConfigured',@@GLOBAL.ssl_cert='/run/tls/server-cert.pem',
 'sslKeyConfigured',@@GLOBAL.ssl_key='/run/tls/server-key.pem',
 'generalLog',@@GLOBAL.general_log,
 'slowLog',@@GLOBAL.slow_query_log,
 'binaryLog',@@GLOBAL.log_bin,
 'localInfile',@@GLOBAL.local_infile,
 'eventScheduler',@@GLOBAL.event_scheduler,
 'schemaNames',(SELECT GROUP_CONCAT(SCHEMA_NAME ORDER BY SCHEMA_NAME SEPARATOR ',') FROM information_schema.SCHEMATA),
 'nonlocalRootAccounts',(SELECT COUNT(*) FROM mysql.global_priv WHERE User='root' AND Host NOT IN ('localhost','127.0.0.1','::1')),
 'otherResxAccounts',(SELECT COUNT(*) FROM mysql.global_priv WHERE LEFT(User,11)='ontoo_resx_' AND User<>'ontoo_resx_pre_probe'),
 'accountCountExcludingProbe',(SELECT COUNT(*) FROM mysql.global_priv WHERE User<>'ontoo_resx_pre_probe'),
 'accountFingerprintExcludingProbe',(SELECT SHA2(COALESCE(GROUP_CONCAT(SHA2(CONCAT(HEX(User),':',HEX(Host),':',Priv),256) ORDER BY User,Host SEPARATOR ''),''),256) FROM mysql.global_priv WHERE User<>'ontoo_resx_pre_probe'),
 'probeAccountCount',(SELECT COUNT(*) FROM mysql.global_priv WHERE User='ontoo_resx_pre_probe'),
 'probe',(SELECT JSON_OBJECT('host',g.Host,'locked',JSON_UNQUOTE(JSON_EXTRACT(g.Priv,'$.account_locked'))='true','accessZero',CAST(JSON_UNQUOTE(JSON_EXTRACT(g.Priv,'$.access')) AS UNSIGNED)=0,'requiresSsl',u.ssl_type='ANY','noPassword',u.authentication_string='','plugin',u.plugin,'noAlternateAuth',JSON_EXTRACT(g.Priv,'$.auth_or') IS NULL,'maxUserConnections',u.max_user_connections) FROM mysql.global_priv g JOIN mysql.user u ON u.User=g.User AND u.Host=g.Host WHERE g.User='ontoo_resx_pre_probe' AND g.Host='172.21.0.1'),
 'probeGrantRows',(SELECT COUNT(*) FROM mysql.db WHERE User='ontoo_resx_pre_probe')+(SELECT COUNT(*) FROM mysql.tables_priv WHERE User='ontoo_resx_pre_probe')+(SELECT COUNT(*) FROM mysql.columns_priv WHERE User='ontoo_resx_pre_probe')+(SELECT COUNT(*) FROM mysql.procs_priv WHERE User='ontoo_resx_pre_probe'),
 'probeRoleRows',(SELECT COUNT(*) FROM mysql.roles_mapping WHERE User='ontoo_resx_pre_probe' OR Role='ontoo_resx_pre_probe')
);
ROLLBACK;
