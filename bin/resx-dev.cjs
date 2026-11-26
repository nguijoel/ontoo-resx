'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { buildEnvironment } = require('./resx-runtime-profile.cjs');

function plan(file, parent = process.env) {
  if (!file || !path.isAbsolute(file)) {
    throw new Error('Set RESX_DEV_ENV_FILE to the Infrastructure-issued absolute protected DEV profile path');
  }
  let input;
  try { input = require('dotenv').parse(fs.readFileSync(file)); }
  catch { throw new Error('Cannot read the protected DEV profile'); }
  const apiEnv = buildEnvironment(input, 'resx-local-dev', parent);
  const root = path.resolve(__dirname, '..');
  const api = path.join(root, 'api');
  const web = path.join(root, 'webapp');
  const webEnv = { NODE_ENV: 'development', NG_CLI_ANALYTICS: 'false', NG_BUILD_MAX_WORKERS: '2' };
  for (const key of ['SystemRoot', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP', 'TMPDIR', 'PATH', 'Path', 'PATHEXT']) {
    if (parent[key]) webEnv[key] = parent[key];
  }
  return [
    { name: 'API', args: ['-r', require.resolve('ts-node/register', { paths: [api] }),
      '-r', require.resolve('tsconfig-paths/register', { paths: [api] }), 'src/main.ts'],
      options: { cwd: api, env: apiEnv, stdio: 'inherit', windowsHide: true } },
    { name: 'frontend', args: ['--openssl-legacy-provider',
      require.resolve('@angular/cli/bin/ng.js', { paths: [web] }),
      'serve', '--host', '127.0.0.1', '--port', '4208'],
      options: { cwd: web, env: webEnv, stdio: 'inherit', windowsHide: true } },
  ];
}

// Spawn Node directly (no shell/yarn grandchildren); stop only children we own.
function start(services, spawnChild = spawn, owner = process, log = console.error) {
  const children = [];
  let stopping = false;
  function stop(code) {
    if (stopping) return;
    stopping = true;
    owner.exitCode = code;
    for (const child of children) {
      if (child.exitCode === null && !child.killed) child.kill('SIGTERM');
    }
  }
  owner.once('SIGINT', () => stop(0));
  owner.once('SIGTERM', () => stop(0));
  try {
    for (const service of services) {
      const child = spawnChild(process.execPath, service.args, service.options);
      children.push(child);
      child.once('error', () => { log(service.name + ' could not start'); stop(1); });
      child.once('exit', code => stop(code === null ? 1 : code));
    }
  } catch {
    stop(1);
    throw new Error('Cannot start isolated RESX services');
  }
  return { children, stop };
}

function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.length === 1 && args[0] !== '--check') {
    throw new Error('Usage: yarn dev:resx [--check]; profile path comes from RESX_DEV_ENV_FILE');
  }
  const services = plan(process.env.RESX_DEV_ENV_FILE);
  if (args[0] === '--check') {
    console.log('DEV profile valid; target ontoo_resx_dev; API3006/frontend4208. No services or database connections started.');
    return;
  }
  console.log('Starting isolated RESX DEV: API http://localhost:3006; frontend http://localhost:4208');
  start(services);
}

module.exports = { plan, start };
if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
