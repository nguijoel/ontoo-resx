'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  c = require('./resx-release.cjs');
function receipt() {
  return {
    repositoryId: '795522855',
    sourceSha: 'a'.repeat(40),
    runId: '123',
    runAttempt: 1,
    registryRepository: 'ghcr.io/nguijoel/ontoo-resx',
    registryManifestDigest: 'sha256:' + 'b'.repeat(64),
    imageId: 'sha256:' + 'c'.repeat(64),
  };
}
test('canonical immutable receipt derives stable release identity across key ordering', () => {
  const r = receipt(),
    a = c.request('deploy', r),
    b = c.request('deploy', Object.fromEntries(Object.entries(r).reverse()));
  assert.equal(a.releaseId, b.releaseId);
  assert.equal(a.packet.receipt, r);
  for (const change of [
    { repositoryId: '1' },
    { runAttempt: true },
    { imageId: 'ghcr.io/x:latest' },
    { registryRepository: 'ghcr.io/other/app' },
    { extra: true },
  ])
    assert.throws(() => c.request('deploy', { ...r, ...change }));
});
test('rollback has only retained target and exact job provenance, never image/config override', () => {
  const provenance = { sourceSha: 'a'.repeat(40), runId: '124', runAttempt: 1 };
  assert.deepEqual(c.request('rollback', null, 'd'.repeat(64), provenance).packet, { action: 'rollback', releaseId: 'd'.repeat(64), ...provenance });
  assert.throws(() => c.request('rollback', null, '../current', provenance));
  assert.throws(() => c.request('rollback', null, 'd'.repeat(64)));
  assert.throws(() => c.request('rollback', null, 'd'.repeat(64), { ...provenance, imageId: 'override' }));
  assert.throws(() => c.request('rollback', null, 'd'.repeat(64), { ...provenance, runAttempt: true }));
  assert.throws(() => c.request('other', receipt()));
});
test('root response must be exact healthy binding and durable receipt; compensation is not success', () => {
  const id = c.request('deploy', receipt()).releaseId,
    row = {
      action: 'deploy',
      releaseId: id,
      application: 'resx',
      environment: 'pre',
      outcome: 'UPDATED',
      success: true,
      receiptSha256: 'e'.repeat(64),
    };
  assert.equal(c.response(JSON.stringify(row), 'deploy', id).outcome, 'UPDATED');
  for (const change of [
    { outcome: 'ROLLED_BACK' },
    { outcome: 'UNKNOWN' },
    { environment: 'prod' },
    { receiptSha256: 'bad' },
    { releaseId: 'f'.repeat(64) },
    { success: false },
    { extra: 'private' },
  ])
    assert.throws(() => c.response(JSON.stringify({ ...row, ...change }), 'deploy', id));
  assert.throws(() => c.response(JSON.stringify(row).replace('"success":true', '"success":false,"success":true'), 'deploy', id));
});

test('intentional authorised rollback is UPDATED with exact retained ID; compensation remains failure', () => {
  const id = 'f'.repeat(64),
    row = {
      action: 'rollback',
      releaseId: id,
      application: 'resx',
      environment: 'pre',
      outcome: 'UPDATED',
      success: true,
      receiptSha256: 'e'.repeat(64),
    };
  assert.equal(c.response(JSON.stringify(row), 'rollback', id).success, true);
  assert.throws(() => c.response(JSON.stringify({ ...row, outcome: 'ROLLED_BACK' }), 'rollback', id));
});

test('fixed SSH argv ignores ambient configs and has no remote command or shell interpolation', () => {
  const a = c.sshArguments('/tmp/synthetic key', '/tmp/synthetic hosts');
  assert.deepEqual(a.slice(0, 2), ['-F', '/dev/null']);
  assert.equal(a.at(-1), 'ontoo-resx-pre-deploy@185.189.0.51');
  assert.equal(a[a.indexOf('-i') + 1], '/tmp/synthetic key');
  assert.ok(a.includes('StrictHostKeyChecking=yes'));
  assert.ok(a.includes('ClearAllForwardings=yes'));
  assert.ok(a.includes('BatchMode=yes'));
  assert.ok(a.includes('UserKnownHostsFile=/tmp/synthetic hosts'));
});

test('known root failures can be retained as sanitized evidence without becoming release success', () => {
  const id = 'd'.repeat(64),
    row = {
      action: 'deploy',
      releaseId: id,
      application: 'resx',
      environment: 'pre',
      outcome: 'REJECTED',
      success: false,
      receiptSha256: 'e'.repeat(64),
    };
  assert.equal(c.decode(JSON.stringify(row), 'deploy', id).outcome, 'REJECTED');
  assert.throws(() => c.response(JSON.stringify(row), 'deploy', id));
  assert.throws(() => c.decode(JSON.stringify({ ...row, success: true }), 'deploy', id));
});

test('only authenticated confirmed BUSY retries same request; timeout and every other outcome do not', async () => {
  const id = 'd'.repeat(64),
    base = {
      action: 'deploy',
      releaseId: id,
      application: 'resx',
      environment: 'pre',
      outcome: 'BUSY',
      success: false,
      receiptSha256: 'e'.repeat(64),
    };
  let sends = 0,
    waits = 0;
  const got = await c.exchange(
    'deploy',
    id,
    async () => {
      sends++;
      return {
        raw: JSON.stringify(sends === 1 ? base : { ...base, outcome: 'UPDATED', success: true }),
        exitCode: sends === 1 ? 75 : 0,
        timedOut: false,
      };
    },
    async ms => {
      assert.equal(ms, 15000);
      waits++;
    },
    () => {},
  );
  assert.equal(got.outcome, 'UPDATED');
  assert.equal(sends, 2);
  assert.equal(waits, 1);
  for (const received of [
    { raw: JSON.stringify(base), exitCode: 75, timedOut: true },
    { raw: JSON.stringify({ ...base, outcome: 'UNKNOWN' }), exitCode: 1, timedOut: false },
    { raw: JSON.stringify({ ...base, outcome: 'REJECTED' }), exitCode: 1, timedOut: false },
    { raw: '', exitCode: 255, timedOut: false },
  ]) {
    let n = 0;
    await assert.rejects(
      c.exchange(
        'deploy',
        id,
        async () => {
          n++;
          return received;
        },
        async () => {
          throw Error('must not retry');
        },
        () => {},
      ),
    );
    assert.equal(n, 1);
  }
});
test('BUSY wait is bounded and cannot become success without a confirmed terminal result', async () => {
  const id = 'd'.repeat(64),
    row = {
      action: 'deploy',
      releaseId: id,
      application: 'resx',
      environment: 'pre',
      outcome: 'BUSY',
      success: false,
      receiptSha256: 'e'.repeat(64),
    };
  let sends = 0,
    waits = 0;
  await assert.rejects(
    c.exchange(
      'deploy',
      id,
      async () => {
        sends++;
        return { raw: JSON.stringify(row), exitCode: 75, timedOut: false };
      },
      async () => {
        waits++;
      },
      () => {},
    ),
  );
  assert.equal(sends, 21);
  assert.equal(waits, 20);
});

test('enrolled public host key matches the approved fingerprint without network discovery', () => {
  const line = c.knownHostLine();
  assert.equal(line, c.HOST + ' ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIF5vI6R8M921fusUs79oLlUMPawhoXszXjClvC/ru4MI\n');
  assert.throws(() => c.knownHostLine('AAAAC3NzaC1lZDI1NTE5AAAAIF5vI6R8M921fusUs79oLlUMPawhoXszXjClvC/ru4MJ'));
  assert.throws(() => c.knownHostLine('untrusted key'));
});
