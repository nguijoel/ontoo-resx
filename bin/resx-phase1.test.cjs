'use strict';
const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const tls = require('node:tls');
const { execFileSync, spawnSync } = require('node:child_process');
const profile = require('./resx-phase1-profile.cjs');
const MysqlConnection = require(path.join(path.dirname(require.resolve('mysql2')), 'lib/base/connection.js'));
let directory, cert, key, input;

before(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'resx-phase1-test-'));
  const keyFile = path.join(directory, 'key.pem');
  const certFile = path.join(directory, 'cert.pem');
  const configFile = path.join(directory, 'openssl.cnf');
  fs.writeFileSync(configFile, '[req]\ndistinguished_name=dn\n[dn]\n');
  execFileSync('openssl', ['req', '-config', configFile, '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', keyFile, '-out', certFile, '-days', '1',
    '-subj', '/CN=resx-pre-db.example.invalid',
    '-addext', 'subjectAltName=DNS:resx-pre-db.example.invalid'],
  { stdio: 'ignore', windowsHide: true });
  cert = fs.readFileSync(certFile);
  key = fs.readFileSync(keyFile);
  input = {
    TR_DB_TYPE: 'mysql', TR_DB_DATABASE: 'ontoo_resx_pre',
    TR_DB_HOST: 'resx-pre-db.example.invalid', TR_DB_TUNNEL_PORT: '13306',
    TR_DB_CA_FILE: certFile, TR_DB_USER: 'test_runtime',
    TR_DB_PASSWORD: 'synthetic-only', TR_SECRET: 'synthetic-isolated-signing-secret-for-tests',
  };
});
after(() => { if (directory) fs.rmSync(directory, { recursive: true, force: true }); });

test('dedicated environment drops imported settings and locks startup controls', () => {
  const polluted = { ...input, TR_DB_AUTOMIGRATE: 'true', TR_SEED_DATA: 'true',
    TR_AUTH_GOOGLE_ENABLED: 'true', TR_MAIL_HOST: 'mail.invalid', TR_AWS_ACCESS_KEY_ID: 'synthetic',
    REDIS_HOST: 'redis.invalid', NODE_OPTIONS: '--require=unexpected' };
  const env = profile.buildEnvironment(polluted, polluted);
  assert.equal(env.TR_DB_AUTOMIGRATE, 'false');
  assert.equal(env.TR_SEED_DATA, 'false');
  assert.equal(env.TR_AUTH_GOOGLE_ENABLED, 'false');
  assert.equal(env.TR_MAIL_HOST, '');
  assert.equal(env.TR_MAIL_DEBUG, 'false');
  assert.equal(env.REDIS_HOST, '');
  assert.equal(env.TR_AWS_ACCESS_KEY_ID, undefined);
  assert.equal(env.NODE_OPTIONS, undefined);
  assert.equal(env.TR_HOST, '127.0.0.1');
  assert.equal(env.TR_PORT, '3006');
});

test('profile rejects wrong target, root account, invalid identity/CA/port and missing settings', () => {
  for (const edit of [
    { TR_DB_DATABASE: 'ontoo_resx_prod' }, { TR_DB_TYPE: 'mariadb' },
    { TR_DB_USER: 'root' }, { TR_DB_HOST: '127.0.0.1' },
    { TR_DB_CA_FILE: path.join(directory, 'absent.pem') },
    { TR_DB_TUNNEL_PORT: '0' }, { TR_DB_TUNNEL_PORT: '13306x' }, { TR_SECRET: '' },
  ]) assert.throws(() => profile.buildEnvironment({ ...input, ...edit }));
});

test('direct profile startup cannot enable migrations, mail, providers or imported credentials', () => {
  const clean = profile.buildEnvironment(input, {});
  for (const edit of [
    { TR_DB_AUTOMIGRATE: 'true' }, { TR_SEED_DATA: 'true' },
    { TR_MAIL_DEBUG: 'true' }, { TR_MAIL_HOST: 'mail.invalid' },
    { TR_AUTH_GOOGLE_ENABLED: 'true' }, { AWS_ACCESS_KEY_ID: 'synthetic' },
    { TR_AWS_ACCESS_KEY_ID: 'synthetic' }, { REDIS_HOST: 'redis.invalid' },
  ]) assert.throws(() => profile.assertRuntimeEnvironment({ ...clean, ...edit }));
});

test('TypeORM receives mysql2 and verified TLS with no dotenv contamination or network connection', () => {
  const api = path.resolve(__dirname, '../api');
  const script = `
    const assert=require('node:assert/strict');
    const {config}=require('./src/config');
    const {dataSourceOptions}=require('./src/connection/datasource');
    const o=dataSourceOptions();
    assert.equal(o.type,'mysql');
    assert.equal(o.database,'ontoo_resx_pre');
    assert.equal(o.connectorPackage,'mysql2');
    assert.equal(o.driver,require('mysql2'));
    assert.equal(o.synchronize,false);
    assert.equal(config.autoMigrate,false);
    assert.equal(config.seedData,false);
    assert.equal(config.providers.google.active,false);
    assert.equal(config.mail.debug,false);
    assert.equal(config.mail.host,'');
    assert.equal(o.ssl.verifyIdentity,true);
    assert.equal(o.ssl.rejectUnauthorized,true);
    assert.equal(typeof o.extra.stream,'function');
    const ds=new (require('typeorm').DataSource)(o);
    assert.equal(ds.driver.loadedConnectorPackage,'mysql2');
    const connection=ds.driver.createConnectionOptions(o,o);
    assert.equal(connection.host,'resx-pre-db.example.invalid');
    assert.equal(connection.stream,o.extra.stream);
    assert.equal(connection.ssl,o.ssl);
  `;
  const result = spawnSync(process.execPath, ['-r', require.resolve('ts-node/register', { paths: [api] }), '-e', script],
    { cwd: api, env: profile.buildEnvironment(input), encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
});

async function handshake(host, ca) {
  const sockets = new Set();
  const server = tls.createServer({ key, cert }, socket => { sockets.add(socket); });
  server.on('connection', socket => { sockets.add(socket); socket.on('error', () => {}); });
  server.on('tlsClientError', () => {});
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  let stream;
  try {
    const env = profile.buildEnvironment({ ...input, TR_DB_HOST: host, TR_DB_TUNNEL_PORT: String(server.address().port) }, {});
    const options = profile.databaseOptions(env);
    // Exercise the installed mysql2 TLS implementation, including its explicit
    // post-handshake hostname check, using the same profile stream/options.
    if (ca !== undefined) options.ssl.ca = ca;
    stream = options.extra.stream();
    await new Promise((resolve, reject) => { stream.once('connect', resolve); stream.once('error', reject); });
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('TLS test timed out')), 4000);
      const connection = {
        config: { host: options.host, ssl: options.ssl },
        stream, packetParser: { execute() {} }, _handleNetworkError() {},
      };
      MysqlConnection.prototype.startTLS.call(connection, error => { clearTimeout(timer); resolve(error || null); });
    });
  } finally {
    if (stream) stream.destroy();
    for (const socket of sockets) socket.destroy();
    await new Promise(resolve => server.close(resolve));
  }
}

test('installed mysql2 accepts matching CA/name through loopback TCP stream', async () => {
  assert.equal(await handshake(input.TR_DB_HOST), null);
});
test('installed mysql2 rejects mismatched certificate identity', async () => {
  const error = await handshake('wrong-name.example.invalid');
  assert.equal(error && error.code, 'ERR_TLS_CERT_ALTNAME_INVALID');
});
test('installed mysql2 rejects untrusted CA', async () => {
  const error = await handshake(input.TR_DB_HOST, []);
  assert.ok(error);
  assert.match(error.code, /SELF_SIGNED|UNABLE_TO_VERIFY|CERT_UNTRUSTED/);
});

test('CLI check validates without connecting and emits no secrets', () => {
  const file = path.join(directory, 'profile.env');
  fs.writeFileSync(file, Object.entries(input).map(([key, value]) => key + '=' + value).join('\n'));
  const result = spawnSync(process.execPath, [path.join(__dirname, 'resx-phase1.cjs'), '--check', file],
    { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /No database connection attempted/);
  assert.ok(!result.stdout.includes(input.TR_DB_PASSWORD));
  assert.ok(!result.stdout.includes(input.TR_SECRET));
});

test('installed mysql2 refuses a server without TLS before sending authentication', async () => {
  const mysql = require('mysql2');
  const server = mysql.createServer();
  const connections = [];
  let authenticated = false;
  server.on('connection', connection => {
    connections.push(connection);
    connection.on('error', () => {});
    connection.serverHandshake({
      protocolVersion: 10, serverVersion: 'synthetic-test', connectionId: 1,
      statusFlags: 2, characterSet: 45, capabilityFlags: 0x00088200,
      authCallback(_request, callback) { authenticated = true; callback(null); },
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let client;
  try {
    const env = profile.buildEnvironment({ ...input, TR_DB_TUNNEL_PORT: String(server._server.address().port) }, {});
    const options = profile.databaseOptions(env);
    const error = await new Promise(resolve => {
      client = mysql.createConnection({
        host: options.host, port: options.port, user: input.TR_DB_USER,
        password: input.TR_DB_PASSWORD, database: profile.DATABASE,
        ssl: options.ssl, stream: options.extra.stream, connectTimeout: 2000,
      });
      client.once('error', resolve);
    });
    assert.equal(error.code, 'HANDSHAKE_NO_SSL_SUPPORT');
    assert.equal(authenticated, false);
  } finally {
    if (client) client.destroy();
    for (const connection of connections) connection.stream.destroy();
    await new Promise(resolve => server.close(resolve));
  }
});
