'use strict';

const net = require('node:net');
const phase1 = require('./resx-phase1-profile.cjs');

// Separate exact contracts: neither can select PROD or the other environment.
const CONTRACTS = Object.freeze({
  'resx-hosted-pre': Object.freeze({
    database: 'ontoo_resx_pre', user: 'ontoo_resx_pre_runtime',
    tcpHost: '172.21.0.2', port: 3306,
    bind: '0.0.0.0', httpPort: '8080', origin: 'https://resx-preview.ontoo.cloud',
    nodeEnv: 'production',
  }),
  'resx-local-dev': Object.freeze({
    database: 'ontoo_resx_dev', user: 'ontoo_resx_dev_runtime',
    tcpHost: '127.0.0.1', bind: '127.0.0.1', httpPort: '3006',
    origin: 'http://localhost:4208', nodeEnv: 'dev',
  }),
});


const PUSH_TARGET = Object.freeze({
  TR_AWS_S3_REGION: 'eu-west-2',
  TR_AWS_S3_BUCKET: 'ontoo-resource',
  TR_AWS_S3_KEY_TEMPLATE: 'resource/{id}/{iso}/{iso}.json',
  TR_AWS_CLOUDFRONT_DISTRIBUTION_ID: 'EEMP5SB3QEMM6',
});
const PUSH_CREDENTIALS = ['TR_AWS_ACCESS_KEY_ID', 'TR_AWS_SECRET_ACCESS_KEY'];
const PUSH_KEYS = [...Object.keys(PUSH_TARGET), ...PUSH_CREDENTIALS];

function pushSettings(input, name) {
  if (!PUSH_KEYS.some(key => input[key])) return {};
  if (name !== 'resx-hosted-pre') throw new Error('Resource push is enabled only for the approved hosted PRE profile');
  for (const [key, value] of Object.entries(PUSH_TARGET)) {
    if (input[key] !== value) throw new Error('Unapproved or incomplete PRE resource push setting: ' + key);
  }
  for (const key of PUSH_CREDENTIALS) {
    if (!input[key]?.trim() || /^(xxx+|<.*>)$/i.test(input[key].trim())) {
      throw new Error('Missing protected PRE resource push credential: ' + key);
    }
  }
  return Object.fromEntries(PUSH_KEYS.map(key => [key, input[key]]));
}

function withoutPushSettings(env) {
  const result = { ...env };
  for (const key of PUSH_KEYS) delete result[key];
  return result;
}

function contract(name) {
  if (!Object.hasOwn(CONTRACTS, name)) throw new Error('Unknown isolated RESX runtime profile');
  return CONTRACTS[name];
}

function normalize(input, name) {
  const c = contract(name);
  if (input.TR_DB_DATABASE !== c.database || input.TR_DB_USER !== c.user) {
    throw new Error('Database/runtime account does not match the selected isolated RESX profile');
  }
  if (name === 'resx-hosted-pre' && (input.TR_DB_NETWORK_HOST !== c.tcpHost || input.TR_DB_PORT !== String(c.port))) {
    throw new Error('Hosted PRE requires its fixed private database IP and port');
  }
  const normalized = {
    ...input, TR_DB_DATABASE: phase1.DATABASE, TR_DB_USER: phase1.RUNTIME_USER,
    TR_DB_TUNNEL_PORT: c.port ? String(c.port) : input.TR_DB_TUNNEL_PORT,
  };
  // Reuse strict CA, localhost certificate identity, port, credential-presence validation.
  phase1.validate(normalized);
  return normalized;
}

function buildEnvironment(input, name, parent = process.env) {
  const c = contract(name);
  const push = pushSettings(input, name);
  const env = phase1.buildEnvironment(normalize(input, name), parent);
  Object.assign(env, push);
  Object.assign(env, {
    NODE_ENV: c.nodeEnv, TR_RUNTIME_PROFILE: name,
    TR_DB_DATABASE: c.database, TR_DB_USER: c.user,
    TR_HOST: c.bind, TR_PORT: c.httpPort, TR_VIRTUAL_HOST: c.origin,
    TR_CORS_ENABLED: name === 'resx-local-dev' ? 'true' : 'false',
  });
  if (c.port) {
    env.TR_DB_NETWORK_HOST = c.tcpHost;
    env.TR_DB_PORT = String(c.port);
  }
  return env;
}

function assertRuntimeEnvironment(env) {
  const c = contract(env.TR_RUNTIME_PROFILE);
  normalize(env, env.TR_RUNTIME_PROFILE);
  pushSettings(env, env.TR_RUNTIME_PROFILE);
  for (const [key, value] of Object.entries({
    NODE_ENV: c.nodeEnv, TR_HOST: c.bind, TR_PORT: c.httpPort,
    TR_VIRTUAL_HOST: c.origin, TR_CORS_ENABLED: env.TR_RUNTIME_PROFILE === 'resx-local-dev' ? 'true' : 'false',
  })) {
    if (env[key] !== value) throw new Error('Unsafe isolated RESX runtime setting: ' + key);
  }
  // Validate all inherited no-migration/seed/outbound controls without weakening
  // the original PRE-local profile's independent contract.
  phase1.assertRuntimeEnvironment({
    ...withoutPushSettings(env), TR_RUNTIME_PROFILE: phase1.PROFILE,
    TR_DB_DATABASE: phase1.DATABASE, TR_DB_USER: phase1.RUNTIME_USER,
    TR_HOST: '127.0.0.1', TR_PORT: '3006',
  });
}

function databaseOptions(env) {
  assertRuntimeEnvironment(env);
  const c = contract(env.TR_RUNTIME_PROFILE);
  const normalized = normalize(env, env.TR_RUNTIME_PROFILE);
  const options = phase1.databaseOptions({
    ...withoutPushSettings(normalized), TR_RUNTIME_PROFILE: phase1.PROFILE, TR_HOST: '127.0.0.1', TR_PORT: '3006',
  });
  const port = c.port || Number(env.TR_DB_TUNNEL_PORT);
  options.port = port;
  options.extra.stream = () => net.createConnection({ host: c.tcpHost, port });
  return options;
}

module.exports = { CONTRACTS, buildEnvironment, assertRuntimeEnvironment, databaseOptions };
