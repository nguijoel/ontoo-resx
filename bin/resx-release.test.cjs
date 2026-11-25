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
test('rollback has only retained identifier and cannot override image/config', () => {
  assert.deepEqual(c.request('rollback', null, 'd'.repeat(64)).packet, { action: 'rollback', releaseId: 'd'.repeat(64) });
  assert.throws(() => c.request('rollback', null, '../current'));
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
