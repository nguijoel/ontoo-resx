'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { buildEnvironment, CONTRACTS } = require('./resx-runtime-profile.cjs');

function main() {
  const args = process.argv.slice(2);
  const check = args[0] === '--check';
  if (check) args.shift();
  const [name, file] = args;
  if (args.length !== 2 || !Object.hasOwn(CONTRACTS, name) || !path.isAbsolute(file)) {
    throw new Error('Usage: node bin/resx-runtime.cjs [--check] <resx-hosted-pre|resx-local-dev> <absolute protected env file>');
  }
  let input;
  try { input = require('dotenv').parse(fs.readFileSync(file)); }
  catch { throw new Error('Cannot read the protected isolated RESX profile'); }
  const env = buildEnvironment(input, name);
  if (check) {
    console.log('Isolated RESX configuration valid: ' + name + '; no database connection attempted.');
    return;
  }
  const hosted = name === 'resx-hosted-pre';
  const cwd = path.resolve(__dirname, hosted ? '../dist' : '../api');
  const nodeArgs = hosted ? ['src/main.js'] : [
    '-r', require.resolve('ts-node/register', { paths: [cwd] }),
    '-r', require.resolve('tsconfig-paths/register', { paths: [cwd] }),
    'src/main.ts',
  ];
  const child = spawn(process.execPath, nodeArgs, { cwd, env, stdio: 'inherit', windowsHide: true });
  child.on('error', () => { console.error('Isolated RESX API could not start'); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code === null ? 1 : code; });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
}
try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
