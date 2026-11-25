'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict');
const risk = require('./resx-risk.cjs');
const repo = { id: 795522855, full_name: 'nguijoel/ontoo-resx' };
const HEAD = 'a'.repeat(40),
  FEATURE = 'b'.repeat(40),
  TREE = 'c'.repeat(40);
function pr() {
  return {
    number: 9,
    state: 'open',
    draft: false,
    changed_files: 1,
    user: { id: 360355133, type: 'Bot' },
    head: { ref: 'codex/style', sha: HEAD, repo },
    base: { ref: 'dev', sha: risk.BASELINE.sha, repo },
  };
}
function sourceFixture() {
  const p = pr();
  let files = [{ status: 'modified', filename: risk.CSS }],
    css = '.search-icon {font-size:1.375rem;}',
    reviews = [];
  const api = async path => {
    if (path.startsWith('/git/ref/heads/')) return { object: { sha: risk.BASELINE.sha } };
    if (path.includes('/files?')) return files;
    if (path.includes('/contents/')) return { encoding: 'base64', size: Buffer.byteLength(css), content: Buffer.from(css).toString('base64') };
    if (path.includes('/reviews?')) return reviews;
    throw Error('unexpected ' + path);
  };
  return { p, api, setFiles: v => (files = v), setCss: v => (css = v), setReviews: v => (reviews = v) };
}
test('routine app CSS passes without human review; arbitrary CSS requires material review', async () => {
  const f = sourceFixture();
  assert.equal((await risk.evaluate(f.api, f.p)).sources[0].material, false);
  f.setCss('.search-icon {font-size:1.375rem;background:url(https://example.test)}');
  await assert.rejects(risk.evaluate(f.api, f.p));
});
test('material and unknown paths require exact authorised independent human review', async () => {
  const f = sourceFixture();
  f.setFiles([{ status: 'modified', filename: 'api/src/auth/auth.service.ts' }]);
  await assert.rejects(risk.evaluate(f.api, f.p));
  const approval = { id: 1, state: 'APPROVED', commit_id: HEAD, user: { id: 6606980, type: 'User' } };
  f.setReviews([approval]);
  assert.equal((await risk.evaluate(f.api, f.p)).sources[0].material, true);
  for (const change of [{ commit_id: FEATURE }, { user: { id: 360355133, type: 'Bot' } }, { user: { id: 123, type: 'User' } }]) {
    f.setReviews([{ ...approval, ...change }]);
    await assert.rejects(risk.evaluate(f.api, f.p));
  }
  f.setReviews([approval, { ...approval, id: 2, state: 'CHANGES_REQUESTED' }]);
  await assert.rejects(risk.evaluate(f.api, f.p));
});
test('rename, draft, fork and incomplete diff fail closed', async () => {
  const f = sourceFixture();
  f.setFiles([{ status: 'renamed', filename: risk.CSS, previous_filename: 'api/src/auth/old.ts' }]);
  await assert.rejects(risk.evaluate(f.api, f.p));
  for (const p of [
    { ...f.p, draft: true },
    { ...f.p, changed_files: 2 },
    { ...f.p, head: { ...f.p.head, repo: { id: 7 } } },
  ])
    await assert.rejects(risk.evaluate(f.api, p));
});
function promotion() {
  const p = pr();
  p.head = { ref: 'dev', sha: HEAD, repo };
  p.base = { ref: 'staging', sha: risk.BASELINE.parent, repo };
  const source = {
    ...pr(),
    number: 8,
    state: 'closed',
    merged: true,
    merged_at: '2026-11-25T12:00:00Z',
    merge_commit_sha: HEAD,
    head: { ref: 'codex/material', sha: FEATURE, repo },
  };
  let approved = true,
    wrongParent = false,
    badBaseline = false;
  const api = async path => {
    if (path === '/git/ref/heads/dev') return { object: { sha: HEAD } };
    if (path === '/git/ref/heads/staging') return { object: { sha: risk.BASELINE.parent } };
    if (path.startsWith('/compare/')) return { status: 'ahead', merge_base_commit: { sha: risk.BASELINE.parent } };
    if (path === '/git/commits/' + HEAD)
      return { sha: HEAD, tree: { sha: TREE }, parents: [{ sha: risk.BASELINE.sha }, { sha: wrongParent ? 'e'.repeat(40) : FEATURE }] };
    if (path === '/git/commits/' + risk.BASELINE.sha)
      return { sha: risk.BASELINE.sha, tree: { sha: badBaseline ? TREE : risk.BASELINE.tree }, parents: [{ sha: risk.BASELINE.parent }] };
    if (path === '/git/commits/' + risk.BASELINE.parent) return { sha: risk.BASELINE.parent, tree: { sha: 'd'.repeat(40) }, parents: [] };
    if (path.startsWith('/commits/')) return [source];
    if (path === '/pulls/8') return source;
    if (path === '/pulls/8/files?per_page=100') return [{ status: 'modified', filename: 'api/src/auth/auth.service.ts' }];
    if (path === '/pulls/8/reviews?per_page=100')
      return approved ? [{ id: 1, state: 'APPROVED', commit_id: FEATURE, user: { id: 6606980, type: 'User' } }] : [];
    throw Error('unexpected ' + path);
  };
  return { p, api, setApproved: v => (approved = v), setWrongParent: v => (wrongParent = v), setBadBaseline: v => (badBaseline = v) };
}
test('promotion carries exact merged dev material approval with no staging human review', async () => {
  const f = promotion(),
    result = await risk.evaluate(f.api, f.p);
  assert.equal(result.destination, 'staging');
  assert.equal(result.sources[0].number, 8);
  assert.equal(result.sources[0].headSha, FEATURE);
  assert.equal(result.sources[0].material, true);
  assert.equal(result.baseline, true);
});
test('unapproved material, unbound merge parent and altered initial baseline reject promotion', async () => {
  for (const mutate of [f => f.setApproved(false), f => f.setWrongParent(true), f => f.setBadBaseline(true)]) {
    const f = promotion();
    mutate(f);
    await assert.rejects(risk.evaluate(f.api, f.p));
  }
});
test('staging cannot promote a feature ref or stale dev tip', async () => {
  const f = promotion();
  await assert.rejects(risk.evaluate(f.api, { ...f.p, head: { ...f.p.head, ref: 'codex/bypass' } }));
  await assert.rejects(risk.evaluate(f.api, { ...f.p, head: { ...f.p.head, sha: FEATURE } }));
});

test('native publisher binds actual head/base/PR tuple and rejects same-name foreign issuer', async () => {
  const f = sourceFixture(),
    original = f.api;
  const sent = [];
  const api = async path => (path === '/pulls/9' ? f.p : path.startsWith('/pulls?') ? [f.p] : path.includes('/check-runs?') ? [] : original(path));
  await risk.publish({
    api,
    pulls: [f.p],
    checkApi: async (path, body) => {
      sent.push(body);
      return { id: 77 };
    },
  });
  assert.equal(sent.length, 2);
  assert.equal(sent[0].name, 'RESX risk admission dev');
  assert.equal(sent[0].status, 'in_progress');
  assert.equal(sent[1].conclusion, 'success');
  const check = { ...sent[1], head_sha: HEAD, id: 22, app: { id: 5919556 } };
  risk.bound([check], f.p, [f.p]);
  assert.throws(() => risk.bound([{ ...check, app: { id: 15368 } }], f.p, [f.p]));
  assert.throws(() => risk.bound([check], f.p, [f.p, { ...f.p, number: 10 }]));
});
test('PR/base movement during collection publishes failure, never stale success', async () => {
  const f = sourceFixture(),
    original = f.api,
    sent = [];
  const api = async path => (path === '/pulls/9' ? f.p : path.startsWith('/pulls?') ? [] : path.includes('/check-runs?') ? [] : original(path));
  await risk.publish({
    api,
    pulls: [f.p],
    checkApi: async (path, body) => {
      sent.push(body);
      return { id: 77 };
    },
  });
  assert.equal(sent[1].conclusion, 'failure');
});

test('all delegated leaves are validated in either mixed-file order despite authorised material review', async () => {
  for (const reverse of [false, true])
    for (const status of ['modified', 'added', 'removed', 'renamed']) {
      const f = sourceFixture();
      f.p.changed_files = 2;
      const delegated = { status, filename: risk.CSS, ...(status === 'renamed' ? { previous_filename: 'webapp/src/old.css' } : {}) };
      const rows = [{ status: 'modified', filename: 'api/src/config.ts' }, delegated];
      f.setFiles(reverse ? rows.reverse() : rows);
      f.setCss('.search-icon {font-size:1.375rem;background:url(https://example.test)}');
      f.setReviews([{ id: 1, state: 'APPROVED', commit_id: HEAD, user: { id: 6606980, type: 'User' } }]);
      await assert.rejects(risk.evaluate(f.api, f.p));
    }
});
test('revocation publishes pending before reviews and failure before disarming native auto-merge', async () => {
  const f = sourceFixture(),
    original = f.api,
    events = [];
  f.p.auto_merge = {};
  f.p.node_id = 'synthetic';
  f.setFiles([{ status: 'modified', filename: 'api/src/config.ts' }]);
  const api = async (path, ...args) => {
    if (path === '/pulls/9') return f.p;
    if (path.startsWith('/pulls?')) return [f.p];
    if (path.includes('/reviews?')) {
      events.push('review-read');
      assert.equal(events[0], 'pending');
      return [{ id: 3, state: 'DISMISSED', commit_id: HEAD, user: { id: 6606980, type: 'User' } }];
    }
    if (path === '/graphql-disable-auto-merge') {
      events.push('disable');
      return {};
    }
    return original(path, ...args);
  };
  await risk.publish({
    api,
    pulls: [f.p],
    checkApi: async (path, body) => {
      events.push(body.status === 'in_progress' ? 'pending' : body.conclusion);
      return { id: 77 };
    },
  });
  assert.deepEqual(events, ['pending', 'review-read', 'failure', 'disable']);
});
test('failure of final live inventory leaves pending admission, never reuses earlier green result', async () => {
  const f = sourceFixture(),
    original = f.api,
    sent = [];
  const api = async path => (path === '/pulls/9' ? f.p : path.startsWith('/pulls?') ? Promise.reject(Error('synthetic outage')) : original(path));
  await assert.rejects(
    risk.publish({
      api,
      pulls: [f.p],
      checkApi: async (path, body) => {
        sent.push(body);
        return { id: 77 };
      },
    }),
  );
  assert.equal(sent.length, 1);
  assert.equal(sent[0].status, 'in_progress');
});
