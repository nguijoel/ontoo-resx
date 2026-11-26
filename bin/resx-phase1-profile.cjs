'use strict';

const fs = require('node:fs');
const net = require('node:net');
const tls = require('node:tls');

const PROFILE = 'resx-phase1';
const DATABASE = 'ontoo_resx_pre';
const RUNTIME_USER = 'ontoo_resx_pre_runtime';

function required(input, key) {
  if (typeof input[key] !== 'string' || !input[key].trim()) {
    throw new Error('Missing phase-one setting: ' + key);
  }
  return input[key];
}

function validate(input) {
  if (required(input, 'TR_DB_DATABASE') !== DATABASE) throw new Error('Phase-one database must be ontoo_resx_pre');
  if (required(input, 'TR_DB_TYPE') !== 'mysql') throw new Error('Phase-one database type must be mysql');
  const host = required(input, 'TR_DB_HOST');
  if (host !== 'localhost') {
    throw new Error('TR_DB_HOST must match the frozen PRE certificate identity: localhost');
  }
  const portText = required(input, 'TR_DB_TUNNEL_PORT');
  const port = Number(portText);
  if (!/^\d+$/.test(portText) || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid TR_DB_TUNNEL_PORT');
  const user = required(input, 'TR_DB_USER');
  if (user !== RUNTIME_USER) throw new Error('Phase one requires the exact isolated PRE runtime account');
  required(input, 'TR_DB_PASSWORD');
  required(input, 'TR_SECRET');
  const caPath = required(input, 'TR_DB_CA_FILE');
  if (!require('node:path').isAbsolute(caPath)) throw new Error('TR_DB_CA_FILE must be absolute');
  let ca;
  try {
    ca = fs.readFileSync(caPath);
    tls.createSecureContext({ ca, minVersion: 'TLSv1.2' });
    if (!ca.toString().includes('-----BEGIN CERTIFICATE-----')) throw new Error();
  } catch {
    throw new Error('Phase-one CA file is missing or invalid');
  }
  return { host, port, user, ca };
}

// Only these values cross into the child. Imported provider/cloud/Redis/mail and
// NODE_OPTIONS values from either the profile file or parent never cross.
function buildEnvironment(input, parent = process.env) {
  validate(input);
  const env = {};
  for (const key of ['SystemRoot', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP', 'TMPDIR', 'PATH', 'Path', 'PATHEXT']) {
    if (parent[key]) env[key] = parent[key];
  }
  for (const key of ['TR_DB_TYPE', 'TR_DB_DATABASE', 'TR_DB_HOST', 'TR_DB_TUNNEL_PORT', 'TR_DB_CA_FILE', 'TR_DB_USER', 'TR_DB_PASSWORD', 'TR_SECRET']) {
    env[key] = input[key];
  }
  return Object.assign(env, {
    NODE_ENV: 'dev', TR_RUNTIME_PROFILE: PROFILE,
    TR_HOST: '127.0.0.1', TR_PORT: '3006', TR_VIRTUAL_HOST: 'http://localhost:4208',
    TR_DB_AUTOMIGRATE: 'false', TR_SEED_DATA: 'false',
    TR_AUTH_GOOGLE_ENABLED: 'false', TR_SIGNUPS_ENABLED: 'false',
    TR_MAIL_DEBUG: 'false', TR_MAIL_HOST: '',
    TR_ACCESS_LOGS_ENABLED: 'false', TR_CORS_ENABLED: 'true',
    REDIS_HOST: '', REDIS_PORT: '', REDIS_PASSWORD: '',
  });
}

function databaseOptions(env) {
  assertRuntimeEnvironment(env);
  const { host, port, ca } = validate(env);
  return {
    connectorPackage: 'mysql2',
    driver: require('mysql2'),
    host,
    port,
    ssl: { ca, rejectUnauthorized: true, verifyIdentity: true, minVersion: 'TLSv1.2' },
    connectTimeout: 5000,
    poolSize: 2,
    extra: {
      // The TCP destination is loopback; mysql2 still sees the certificate DNS
      // name as host and uses it for both SNI and checkServerIdentity.
      stream: () => net.createConnection({ host: '127.0.0.1', port }),
    },
  };
}


// Defence in depth for callers that bypass the dedicated launcher.
function assertRuntimeEnvironment(env) {
  validate(env);
  const locked = {
    TR_RUNTIME_PROFILE: PROFILE, TR_DB_AUTOMIGRATE: 'false', TR_SEED_DATA: 'false',
    TR_AUTH_GOOGLE_ENABLED: 'false', TR_SIGNUPS_ENABLED: 'false',
    TR_MAIL_DEBUG: 'false', TR_MAIL_HOST: '', TR_HOST: '127.0.0.1', TR_PORT: '3006',
    REDIS_HOST: '', REDIS_PORT: '', REDIS_PASSWORD: '',
  };
  for (const [key, value] of Object.entries(locked)) {
    if (env[key] !== value) throw new Error('Unsafe phase-one runtime setting: ' + key);
  }
  for (const key of Object.keys(env)) {
    if (env[key] && (/^(AWS_|TR_AWS_|TR_AUTH_GOOGLE_)/.test(key) && key !== 'TR_AUTH_GOOGLE_ENABLED'
      || /^TR_MAIL_/.test(key) && !['TR_MAIL_DEBUG', 'TR_MAIL_HOST'].includes(key)
      || key === 'NODE_OPTIONS')) {
      throw new Error('Unexpected outbound/runtime setting in phase-one environment: ' + key);
    }
  }
}

module.exports = { PROFILE, DATABASE, RUNTIME_USER, validate, buildEnvironment, databaseOptions, assertRuntimeEnvironment };
