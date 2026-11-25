'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const dotenv = require('dotenv');
const { buildEnvironment } = require('./resx-phase1-profile.cjs');

function main() {
  const args = process.argv.slice(2);
  const check = args[0] === '--check';
  const file = args[check ? 1 : 0];
  if (!file || args.length !== (check ? 2 : 1) || !path.isAbsolute(file)) {
    throw new Error('Usage: node bin/resx-phase1.cjs [--check] <absolute dedicated profile env file>');
  }
  let input;
  try { input = dotenv.parse(fs.readFileSync(file)); }
  catch { throw new Error('Cannot read the dedicated phase-one profile file'); }
  const env = buildEnvironment(input);
  if (check) {
    console.log('Phase-one configuration valid: ontoo_resx_pre; API loopback:3006; TLS CA and hostname verification required; migrations/seeding/outbound disabled. No database connection attempted.');
    return;
  }
  const api = path.resolve(__dirname, '../api');
  const child = spawn(process.execPath, [
    '-r', require.resolve('ts-node/register', { paths: [api] }),
    '-r', require.resolve('tsconfig-paths/register', { paths: [api] }),
    'src/main.ts',
  ], { cwd: api, env, stdio: 'inherit', windowsHide: true });
  child.on('error', () => { console.error('Phase-one API process could not start'); process.exitCode = 1; });
  child.on('exit', (code) => { process.exitCode = code === null ? 1 : code; });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
}
try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
