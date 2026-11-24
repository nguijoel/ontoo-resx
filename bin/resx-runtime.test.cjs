'use strict';
const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const runtime = require('./resx-runtime-profile.cjs');
let directory, input;
before(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'resx-runtime-test-'));
  const ca = path.join(directory, 'ca.pem');
  const conf = path.join(directory, 'openssl.cnf');
  fs.writeFileSync(conf, '[req]\ndistinguished_name=dn\n[dn]\n');
  execFileSync('openssl', ['req', '-config', conf, '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', path.join(directory, 'key.pem'), '-out', ca, '-days', '1',
    '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'],
    { stdio: 'ignore', windowsHide: true });
  input = { TR_DB_TYPE: 'mysql', TR_DB_HOST: 'localhost', TR_DB_CA_FILE: ca,
    TR_DB_PASSWORD: 'synthetic-only', TR_SECRET: 'synthetic-isolated-signing-secret',
    TR_DB_DATABASE: 'ontoo_resx_pre', TR_DB_USER: 'ontoo_resx_pre_runtime',
    TR_DB_NETWORK_HOST: 'ontoo-resx-mariadb-pre', TR_DB_PORT: '3306' };
});
after(() => { if (directory) fs.rmSync(directory, { recursive: true, force: true }); });

test('hosted PRE locks network alias, identity, runtime account and startup controls', () => {
  const env = runtime.buildEnvironment({ ...input, TR_SEED_DATA: 'true',
    AWS_ACCESS_KEY_ID: 'synthetic', TR_MAIL_HOST: 'mail.invalid' }, 'resx-hosted-pre');
  runtime.assertRuntimeEnvironment(env);
  const options = runtime.databaseOptions(env);
  assert.equal(env.TR_DB_DATABASE, 'ontoo_resx_pre');
  assert.equal(env.TR_HOST, '0.0.0.0');
  assert.equal(env.TR_PORT, '8080');
  assert.equal(env.TR_VIRTUAL_HOST, 'https://resx-preview.ontoo.cloud');
  assert.equal(env.TR_CORS_ENABLED, 'false');
  assert.equal(env.TR_DB_AUTOMIGRATE, 'false');
  assert.equal(env.TR_SEED_DATA, 'false');
  assert.equal(env.AWS_ACCESS_KEY_ID, undefined);
  assert.equal(env.TR_MAIL_HOST, '');
  assert.equal(options.host, 'localhost');
  assert.equal(options.port, 3306);
  assert.equal(options.ssl.rejectUnauthorized, true);
  assert.equal(options.ssl.verifyIdentity, true);
  assert.equal(options.connectorPackage, 'mysql2');
});

test('hosted PRE rejects target/account/network substitutions', () => {
  for (const edit of [
    { TR_DB_DATABASE: 'ontoo_resx_dev' }, { TR_DB_DATABASE: 'ontoo_resx_prod' },
    { TR_DB_USER: 'ontoo_resx_pre_restore' }, { TR_DB_USER: 'root' },
    { TR_DB_HOST: 'remote.invalid' }, { TR_DB_NETWORK_HOST: 'remote.invalid' },
    { TR_DB_PORT: '13306' },
  ]) assert.throws(() => runtime.buildEnvironment({ ...input, ...edit }, 'resx-hosted-pre'));
});

test('local DEV is separate and cannot select PRE or its runtime account', () => {
  const dev = { ...input, TR_DB_DATABASE: 'ontoo_resx_dev',
    TR_DB_USER: 'ontoo_resx_dev_runtime', TR_DB_TUNNEL_PORT: '13307' };
  const env = runtime.buildEnvironment(dev, 'resx-local-dev');
  runtime.assertRuntimeEnvironment(env);
  assert.equal(env.TR_HOST, '127.0.0.1');
  assert.equal(env.TR_PORT, '3006');
  assert.equal(env.TR_DB_NETWORK_HOST, undefined);
  assert.equal(runtime.databaseOptions(env).port, 13307);
  assert.throws(() => runtime.buildEnvironment(input, 'resx-local-dev'));
  assert.throws(() => runtime.buildEnvironment({ ...dev, TR_DB_USER: input.TR_DB_USER }, 'resx-local-dev'));
  assert.throws(() => runtime.buildEnvironment(dev, 'resx-prod'));
});

test('both runtime profiles bypass dotenv and pass exact target to TypeORM without connecting', () => {
  const api = path.resolve(__dirname, '../api');
  for (const name of ['resx-hosted-pre', 'resx-local-dev']) {
    const c = runtime.CONTRACTS[name];
    const env = runtime.buildEnvironment({ ...input, TR_DB_DATABASE: c.database,
      TR_DB_USER: c.user, TR_DB_TUNNEL_PORT: '13307' }, name);
    const script = `
      const assert=require('node:assert/strict');
      require('./src/env.logger');
      const {config}=require('./src/config');
      const o=require('./src/connection/datasource').dataSourceOptions();
      assert.equal(o.database,process.env.TR_DB_DATABASE);
      assert.equal(o.username,process.env.TR_DB_USER);
      assert.equal(o.host,'localhost');
      assert.equal(o.synchronize,false);
      assert.equal(config.autoMigrate,false);
      assert.equal(config.seedData,false);
      assert.equal(config.mail.host,'');
      assert.equal(config.providers.google.active,false);
      const ds=new (require('typeorm').DataSource)(o);
      assert.equal(ds.driver.loadedConnectorPackage,'mysql2');
    `;
    const result = spawnSync(process.execPath,
      ['-r', require.resolve('ts-node/register', { paths: [api] }), '-e', script],
      { cwd: api, env, encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 0, result.stderr);
    for (const edit of [{ TR_SEED_DATA: 'true' }, { TR_HOST: 'wrong' }, { TR_MAIL_HOST: 'remote.invalid' }]) {
      assert.throws(() => runtime.assertRuntimeEnvironment({ ...env, ...edit }));
    }
  }
});

test('hosted CLI check performs no connection and prints no credential values', () => {
  const file = path.join(directory, 'hosted.env');
  fs.writeFileSync(file, Object.entries(input).map(([k, v]) => k + '=' + v).join('\n'));
  const result = spawnSync(process.execPath, [path.join(__dirname, 'resx-runtime.cjs'),
    '--check', 'resx-hosted-pre', file], { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /no database connection attempted/);
  assert.ok(!result.stdout.includes(input.TR_DB_PASSWORD));
});
