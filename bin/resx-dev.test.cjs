'use strict';
const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { execFileSync, spawnSync } = require('node:child_process');
const { plan, start } = require('./resx-dev.cjs');
let directory, file, input;
function writeProfile(edit = {}) {
  fs.writeFileSync(file, Object.entries({ ...input, ...edit }).map(([k, v]) => k + '=' + v).join('\n'));
}
before(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'resx-dev-test-'));
  file = path.join(directory, 'dev.env');
  const conf = path.join(directory, 'openssl.cnf');
  const ca = path.join(directory, 'ca.pem');
  fs.writeFileSync(conf, '[req]\ndistinguished_name=dn\n[dn]\n');
  execFileSync('openssl', ['req', '-config', conf, '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', path.join(directory, 'key.pem'), '-out', ca, '-days', '1',
    '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost'],
    { stdio: 'ignore', windowsHide: true });
  input = { TR_DB_TYPE: 'mysql', TR_DB_HOST: 'localhost', TR_DB_CA_FILE: ca,
    TR_DB_PASSWORD: 'synthetic-password', TR_SECRET: 'synthetic-local-signing-secret',
    TR_DB_DATABASE: 'ontoo_resx_dev', TR_DB_USER: 'ontoo_resx_dev_runtime',
    TR_DB_TUNNEL_PORT: '13307' };
  writeProfile();
});
after(() => { if (directory) fs.rmSync(directory, { recursive: true, force: true }); });

test('both services use fixed local ports and only API receives sanitized DEV credentials', () => {
  writeProfile();
  const [api, web] = plan(file, { NODE_OPTIONS: '--require=unexpected', AWS_ACCESS_KEY_ID: 'synthetic',
    TR_DB_PASSWORD: 'wrong-ambient', REDIS_HOST: 'remote.invalid', PATH: process.env.PATH });
  assert.equal(api.options.env.TR_DB_DATABASE, 'ontoo_resx_dev');
  assert.equal(api.options.env.TR_DB_PASSWORD, input.TR_DB_PASSWORD);
  assert.equal(api.options.env.TR_MAIL_DEBUG, 'false');
  assert.equal(api.options.env.TR_SEED_DATA, 'false');
  assert.equal(api.options.env.TR_DB_AUTOMIGRATE, 'false');
  assert.equal(api.options.env.NODE_OPTIONS, undefined);
  assert.equal(api.options.env.AWS_ACCESS_KEY_ID, undefined);
  assert.equal(web.options.env.TR_DB_PASSWORD, undefined);
  assert.equal(web.options.env.TR_SECRET, undefined);
  assert.equal(web.options.env.REDIS_HOST, undefined);
  assert.equal(web.options.env.NODE_OPTIONS, undefined);
  assert.ok(web.args.includes('4208'));
  assert.ok(web.args.includes('127.0.0.1'));
  assert.equal(api.options.env.TR_PORT, '3006');
});

test('missing/relative/invalid/PRE profiles fail before any service starts', () => {
  assert.throws(() => plan(undefined));
  assert.throws(() => plan('api/.env'));
  assert.throws(() => plan(path.join(directory, 'absent.env')));
  for (const edit of [{ TR_DB_DATABASE: 'ontoo_resx_pre' },
    { TR_DB_USER: 'ontoo_resx_pre_runtime' }, { TR_DB_CA_FILE: '' }]) {
    writeProfile(edit);
    assert.throws(() => plan(file));
  }
  writeProfile();
});

function fakeChild() {
  const child = new EventEmitter();
  child.exitCode = null;
  child.killed = false;
  child.kill = signal => { child.killed = true; child.signal = signal; return true; };
  return child;
}
test('a service failure stops its sibling and keeps a failing command exit code', () => {
  const owner = new EventEmitter(), children = [];
  start([{ name: 'API', args: [], options: {} }, { name: 'frontend', args: [], options: {} }],
    () => { const child = fakeChild(); children.push(child); return child; }, owner, () => {});
  children[0].exitCode = 1;
  children[0].emit('exit', 1);
  assert.equal(owner.exitCode, 1);
  assert.equal(children[1].signal, 'SIGTERM');
  children[1].emit('exit', 0);
  assert.equal(owner.exitCode, 1);
});
test('Ctrl+C terminates only owned children', () => {
  const owner = new EventEmitter(), child = fakeChild();
  start([{ name: 'API', args: [], options: {} }], () => child, owner, () => {});
  owner.emit('SIGINT');
  assert.equal(child.signal, 'SIGTERM');
  assert.equal(owner.exitCode, 0);
});

test('check command validates without launching and does not expose credentials', () => {
  writeProfile();
  const result = spawnSync(process.execPath, [path.join(__dirname, 'resx-dev.cjs'), '--check'],
    { env: { ...process.env, RESX_DEV_ENV_FILE: file }, encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /No services or database connections started/);
  assert.ok(!result.stdout.includes(input.TR_DB_PASSWORD));
  assert.ok(!result.stdout.includes(input.TR_SECRET));
});
