'use strict';
const crypto = require('node:crypto'),
  fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path'),
  cp = require('node:child_process');
const HOST = '185.189.0.51',
  PORT = 2222,
  USER = 'ontoo-resx-pre-deploy',
  PIN = 'SHA256:5kusMUREWU3SqjdhScMHqnokrqvi4WcLJ5tDCy2cHcI';
const HOST_KEY = 'AAAAC3NzaC1lZDI1NTE5AAAAIF5vI6R8M921fusUs79oLlUMPawhoXszXjClvC/ru4MI';
const HEX = /^[a-f0-9]{64}$/;
function knownHostLine(publicKey = HOST_KEY) {
  demand(typeof publicKey === 'string' && /^[A-Za-z0-9+/]+={0,2}$/.test(publicKey));
  const wire = Buffer.from(publicKey, 'base64');
  demand(wire.toString('base64') === publicKey);
  const fingerprint = 'SHA256:' + crypto.createHash('sha256').update(wire).digest('base64').replace(/=+$/, '');
  demand(fingerprint === PIN);
  return '[' + HOST + ']:' + PORT + ' ssh-ed25519 ' + publicKey + '\n';
}
function demand(ok) {
  if (!ok) throw Error('RESX_RELEASE_UNCONFIRMED_NO_RETRY');
}
function canonical(value) {
  return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b, 'en'))));
}
function request(action, receipt, releaseId, provenance) {
  demand(['deploy', 'rollback'].includes(action));
  if (action === 'rollback') {
    demand(HEX.test(releaseId || '') && provenance && Object.keys(provenance).sort().join(',') === 'runAttempt,runId,sourceSha');
    demand(
      /^[a-f0-9]{40}$/.test(provenance.sourceSha) &&
        /^[1-9][0-9]{0,19}$/.test(provenance.runId) &&
        Number.isSafeInteger(provenance.runAttempt) &&
        provenance.runAttempt > 0 &&
        provenance.runAttempt <= 2147483647,
    );
    return { packet: { action, releaseId, ...provenance }, releaseId };
  }
  demand(
    receipt && Object.keys(receipt).sort().join(',') === 'imageId,registryManifestDigest,registryRepository,repositoryId,runAttempt,runId,sourceSha',
  );
  demand(
    receipt.repositoryId === '795522855' &&
      receipt.registryRepository === 'ghcr.io/nguijoel/ontoo-resx' &&
      /^[a-f0-9]{40}$/.test(receipt.sourceSha) &&
      /^[1-9][0-9]{0,19}$/.test(receipt.runId) &&
      Number.isSafeInteger(receipt.runAttempt) &&
      receipt.runAttempt > 0 &&
      receipt.runAttempt <= 2147483647 &&
      /^sha256:[a-f0-9]{64}$/.test(receipt.imageId) &&
      /^sha256:[a-f0-9]{64}$/.test(receipt.registryManifestDigest),
  );
  return { packet: { action, receipt }, releaseId: crypto.createHash('sha256').update(canonical(receipt)).digest('hex') };
}
function decode(raw, action, releaseId) {
  demand(Buffer.byteLength(raw) <= 16384 && !raw.includes('\\'));
  const row = JSON.parse(raw);
  const keys = ['action', 'application', 'environment', 'outcome', 'receiptSha256', 'releaseId', 'success'];
  demand(Object.keys(row).sort().join(',') === keys.slice().sort().join(','));
  for (const key of keys) demand((raw.match(new RegExp('"' + key + '"\\s*:', 'g')) || []).length === 1);
  demand(
    row.action === action &&
      row.releaseId === releaseId &&
      row.application === 'resx' &&
      row.environment === 'pre' &&
      HEX.test(row.receiptSha256) &&
      ['UPDATED', 'NO_CHANGE', 'ROLLED_BACK', 'UNKNOWN', 'REJECTED', 'BUSY'].includes(row.outcome) &&
      typeof row.success === 'boolean',
  );
  demand(row.success === ['UPDATED', 'NO_CHANGE'].includes(row.outcome));
  return row;
}
function response(raw, action, releaseId) {
  const row = decode(raw, action, releaseId);
  demand(row.success);
  return row;
}
function invoke(command, args, input, timeout = 15000) {
  return cp.execFileSync(command, args, {
    input,
    timeout,
    maxBuffer: 65536,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { PATH: process.env.PATH, HOME: process.env.HOME, LANG: 'C' },
  });
}
function transportDiagnostic(error) {
  const stderr =
    typeof error.stderr === 'string'
      ? error.stderr.slice(0, 65536)
      : Buffer.isBuffer(error.stderr)
        ? error.stderr.subarray(0, 65536).toString('utf8')
        : '';
  const patterns = [
    ['key-format', /Load key [^\r\n]{0,4096}: (invalid format|error in libcrypto)|UNPROTECTED PRIVATE KEY FILE|bad permissions/],
    ['host-key', /Host key verification failed|REMOTE HOST IDENTIFICATION HAS CHANGED/],
    ['connect-timeout', /connect to host [^\r\n]{0,256}: (Connection timed out|Operation timed out)|Connection timed out during banner exchange/],
    ['connect-refused', /connect to host [^\r\n]{0,256}: Connection refused/],
    ['authentication', /Permission denied \(publickey(?:,[^\r\n)]{0,128})?\)/],
    ['forced-command', /sudo: [^\r\n]{0,4096}(a password is required|not allowed|command not found|no tty present)/],
    ['receiver-rejected', /Approved PRE release rejected or failed/],
  ];
  return {
    nativeExitCode: Number.isInteger(error.status) && error.status >= 0 && error.status <= 255 ? error.status : null,
    timedOut: !!error.signal || error.code === 'ETIMEDOUT',
    signal:
      typeof error.signal === 'string'
        ? ['SIGTERM', 'SIGKILL', 'SIGINT', 'SIGHUP', 'SIGABRT'].includes(error.signal)
          ? error.signal
          : 'OTHER'
        : null,
    category: patterns.find(([, pattern]) => pattern.test(stderr))?.[0] || 'unknown',
  };
}
function sshArguments(key, hosts) {
  return [
    '-F',
    '/dev/null',
    '-T',
    '-p',
    String(PORT),
    '-i',
    key,
    '-o',
    'BatchMode=yes',
    '-o',
    'IdentitiesOnly=yes',
    '-o',
    'StrictHostKeyChecking=yes',
    '-o',
    'UserKnownHostsFile=' + hosts,
    '-o',
    'GlobalKnownHostsFile=/dev/null',
    '-o',
    'PasswordAuthentication=no',
    '-o',
    'KbdInteractiveAuthentication=no',
    '-o',
    'PreferredAuthentications=publickey',
    '-o',
    'RequestTTY=no',
    '-o',
    'ForwardAgent=no',
    '-o',
    'ClearAllForwardings=yes',
    '-o',
    'ControlMaster=no',
    '-o',
    'ControlPath=none',
    '-o',
    'ConnectTimeout=15',
    '-o',
    'ConnectionAttempts=1',
    '-o',
    'ServerAliveInterval=15',
    '-o',
    'ServerAliveCountMax=2',
    USER + '@' + HOST,
  ];
}
async function exchange(action, releaseId, send, delay, record) {
  for (let attempt = 0; attempt <= 20; attempt++) {
    const received = await send();
    let row;
    try {
      row = decode(received.raw, action, releaseId);
    } catch {
      throw Error('RESX_TRANSPORT_UNCONFIRMED_NO_RETRY');
    }
    record(row);
    if (!received.timedOut && row.outcome === 'BUSY' && [0, 75].includes(received.exitCode) && attempt < 20) {
      await delay(15000);
      continue;
    }
    if (received.timedOut || received.exitCode !== 0 || !row.success) {
      const failure = Error('RESX_RELEASE_UNCONFIRMED_NO_RETRY');
      failure.safeResult = row;
      throw failure;
    }
    return row;
  }
  throw Error('RESX_BUSY_BOUND_EXCEEDED');
}
async function main() {
  demand(process.platform === 'linux' && process.env.GITHUB_REPOSITORY === 'nguijoel/ontoo-resx' && process.env.GITHUB_REF === 'refs/heads/staging');
  const action = process.env.RESX_ACTION || 'deploy';
  if (action === 'rollback') demand(process.env.GITHUB_EVENT_NAME === 'workflow_dispatch' && process.env.GITHUB_ACTOR_ID === '6606980');
  const receipt = action === 'deploy' ? JSON.parse(process.env.RESX_RECEIPT_JSON || 'null') : null;
  const selected = request(action, receipt, process.env.RESX_RELEASE_ID, {
    sourceSha: process.env.GITHUB_SHA,
    runId: process.env.GITHUB_RUN_ID,
    runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT),
  });
  if (receipt)
    demand(
      receipt.sourceSha === process.env.GITHUB_SHA &&
        receipt.runId === process.env.GITHUB_RUN_ID &&
        receipt.runAttempt === Number(process.env.GITHUB_RUN_ATTEMPT),
    );
  const ref = await fetch('https://api.github.com/repos/nguijoel/ontoo-resx/git/ref/heads/staging', {
    headers: { Authorization: 'Bearer ' + process.env.GH_TOKEN, Accept: 'application/vnd.github+json' },
    redirect: 'error',
    signal: AbortSignal.timeout(20000),
  });
  demand(ref.ok && (await ref.json()).object.sha === process.env.GITHUB_SHA);
  const secret = process.env.RESX_DEPLOY_KEY;
  demand(typeof secret === 'string' && secret.length >= 256 && secret.length <= 16384);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ontoo-resx-pre-'));
  fs.chmodSync(directory, 0o700);
  const key = path.join(directory, 'key'),
    hosts = path.join(directory, 'known_hosts');
  const evidence = path.join(process.env.RUNNER_TEMP, 'resx-release-request.json');
  fs.writeFileSync(evidence, JSON.stringify(selected.packet) + '\n', { flag: 'wx', mode: 0o600 });
  let phase = 'private-key-file',
    sshInvoked = false,
    transport = null;
  try {
    fs.writeFileSync(key, secret, { flag: 'wx', mode: 0o600 });
    phase = 'host-key-pin';
    fs.writeFileSync(hosts, knownHostLine(), { flag: 'wx', mode: 0o600 });
    const args = sshArguments(key, hosts);
    let result;
    phase = 'attempt-evidence';
    const attempts = fs.openSync(path.join(process.env.RUNNER_TEMP, 'resx-release-attempts.jsonl'), 'wx', 0o600);
    try {
      result = await exchange(
        action,
        selected.releaseId,
        async () => {
          try {
            phase = 'ssh-exchange';
            sshInvoked = true;
            transport = { nativeExitCode: 0, timedOut: false, signal: null, category: 'none' };
            return { raw: invoke('/usr/bin/ssh', args, JSON.stringify(selected.packet) + '\n', 900000), exitCode: 0, timedOut: false };
          } catch (error) {
            transport = transportDiagnostic(error);
            return { raw: String(error.stdout || ''), exitCode: error.status, timedOut: !!error.signal || error.code === 'ETIMEDOUT' };
          }
        },
        ms => new Promise(resolve => setTimeout(resolve, ms)),
        row => {
          fs.writeSync(attempts, JSON.stringify(row) + '\n');
          fs.fsyncSync(attempts);
        },
      );
    } catch (error) {
      fs.writeFileSync(
        path.join(process.env.RUNNER_TEMP, 'resx-release-result.json'),
        JSON.stringify(error.safeResult || { action, releaseId: selected.releaseId, outcome: 'UNKNOWN', success: false, rootReceiptPresent: false }) +
          '\n',
        { flag: 'wx', mode: 0o600 },
      );
      throw Error('RESX_RELEASE_UNCONFIRMED_NO_RETRY');
    } finally {
      fs.closeSync(attempts);
    }

    fs.writeFileSync(path.join(process.env.RUNNER_TEMP, 'resx-release-result.json'), JSON.stringify(result) + '\n', { flag: 'wx', mode: 0o600 });
    demand(result.success);
    phase = 'public-health';
    const health = await fetch('https://resx-preview.ontoo.cloud/health', { redirect: 'error', signal: AbortSignal.timeout(15000) });
    demand(health.status === 200);
    fs.appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      JSON.stringify(result) + '\nPublic HTTPS /health:200. Root receipt binds source/image/config; application-only release, no DB migration.\n',
    );
  } catch (error) {
    fs.writeFileSync(
      path.join(process.env.RUNNER_TEMP, 'resx-release-transport.json'),
      JSON.stringify({ phase, sshInvoked, automaticRetry: false, transport }) + '\n',
      { flag: 'wx', mode: 0o600 },
    );
    throw error;
  } finally {
    for (const file of [key, hosts]) if (fs.existsSync(file)) fs.unlinkSync(file);
    fs.rmdirSync(directory);
  }
}
if (require.main === module)
  main().catch(() => {
    console.error('RESX_RELEASE_UNCONFIRMED_PRESERVE_STATE_NO_RETRY');
    process.exitCode = 1;
  });
module.exports = { request, response, decode, canonical, sshArguments, exchange, knownHostLine, transportDiagnostic, HOST, PORT, USER, PIN };
