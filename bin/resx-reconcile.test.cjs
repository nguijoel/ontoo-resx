'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict');
const { successful, reconcile, recoverMergeHandoff, nativeCreator } = require('./resx-reconcile.cjs');
const head = 'a'.repeat(40),
  old = 'b'.repeat(40),
  policyApp = 999;
function checks(branch) {
  return [
    { id: 1, name: 'RESX CI', head_sha: head, status: 'completed', conclusion: 'success', app: { id: 15368 } },
    { id: 2, name: 'ONTOO policy eligibility ' + branch, head_sha: head, status: 'completed', conclusion: 'success', app: { id: policyApp } },
  ];
}
test('latest CI failure or pending state defeats stale success', () => {
  assert.ok(successful(checks('dev'), head));
  for (const change of [{ conclusion: 'failure' }, { status: 'in_progress', conclusion: null }])
    assert.equal(successful([...checks('dev'), { ...checks('dev')[0], id: 3, ...change }], head), false);
});
function fixture(prs = []) {
  const calls = [];
  const result = {
    calls,
    api: async (path, body) => {
      calls.push({ path, body });
      if (body) return {};
      if (path === '') return { id: 795522855, full_name: 'nguijoel/ontoo-resx', default_branch: 'dev', allow_auto_merge: true };
      if (['/branches/dev', '/branches/staging'].includes(path)) return { protected: true };
      if (path === '/git/ref/heads/dev') return { object: { sha: head } };
      if (path === '/git/ref/heads/staging') return { object: { sha: old } };
      if (path.startsWith('/pulls?')) return prs;
      if (path.startsWith('/actions/workflows/')) return { path: '.github/workflows/resx-ci.yml' };
      if (path.startsWith('/git/commits/')) return { tree: { sha: path.endsWith(head) ? 'c'.repeat(40) : 'd'.repeat(40) } };
      if (path.startsWith('/compare/')) return { status: 'ahead', merge_base_commit: { sha: old } };
      throw Error('unexpected fixed path');
    },
  };
  result.createPullRequest = body => result.api('/pulls', body);
  return result;
}
const run = { id: 1, workflow_id: 2, head_branch: 'dev', head_sha: head, conclusion: 'success', repository: { id: 795522855 } };
test('validated current dev delegates promotion PR to a qualified creator, never substitutes dispatch checks', async () => {
  const f = fixture();
  await reconcile({ ...f, policyApp, validatedRun: run });
  assert.equal(f.calls.filter(x => x.path === '/pulls' && x.body).length, 1);
  assert.equal(f.calls.filter(x => x.path.endsWith('/dispatches')).length, 0);
});
test('existing draft promotion never merges or recursively redispatches', async () => {
  const f = fixture([{ draft: true, base: { ref: 'staging' }, head: { ref: 'dev', sha: head, repo: { id: 795522855 } } }]);
  await reconcile({ ...f, policyApp, validatedRun: run });
  assert.equal(f.calls.filter(x => x.body).length, 0);
});
test('unvalidated or stale runs never promote', async () => {
  for (const validatedRun of [null, { ...run, head_sha: old }, { ...run, conclusion: 'failure' }]) {
    const f = fixture();
    await reconcile({ ...f, policyApp, validatedRun });
    assert.equal(f.calls.filter(x => x.body).length, 0);
  }
});

test('native staging merge receives a no-content ancestry sync, not an endless promotion', async () => {
  const f = fixture();
  const original = f.api;
  f.api = async (path, body, ...rest) => {
    if (path.startsWith('/git/commits/')) return { tree: { sha: 'c'.repeat(40) } };
    if (path.startsWith('/compare/')) return { status: 'ahead', merge_base_commit: { sha: head } };
    return original(path, body, ...rest);
  };
  await reconcile({ ...f, policyApp, validatedRun: { ...run, head_branch: 'staging', head_sha: old } });
  const create = f.calls.find(x => x.path === '/pulls' && x.body);
  assert.equal(create.body.head, 'staging');
  assert.equal(create.body.base, 'dev');
});

test('native clean PR enables auto-merge; already enabled is idempotent', async () => {
  for (const alreadyEnabled of [false, true]) {
    const pr = {
      number: 7,
      mergeable: true,
      mergeable_state: 'clean',
      draft: false,
      state: 'open',
      node_id: 'synthetic-node',
      auto_merge: alreadyEnabled ? { enabled_by: { login: 'github-actions' } } : null,
      base: { ref: 'dev', sha: old },
      head: { sha: head, ref: 'codex/change', repo: { id: 795522855 } },
    };
    const f = fixture([pr]),
      original = f.api;
    f.api = async (path, body, ...rest) => {
      if (path === '/git/ref/heads/dev') return { object: { sha: old } };
      if (path.startsWith('/commits/')) {
        const result = checks('dev');
        result[1].output = {
          text: JSON.stringify({
            version: 1,
            repositoryId: 795522855,
            headSha: head,
            destination: 'dev',
            expiresAtMs: Date.now() + 30000,
            pullRequests: [{ number: 7, baseSha: old, headRef: 'codex/change' }],
          }),
        };
        return result;
      }
      if (path === '/pulls/7') return pr;
      return original(path, body, ...rest);
    };
    await reconcile({ ...f, policyApp, validatedRun: null });
    assert.equal(f.calls.filter(x => x.path === '/graphql-enable-auto-merge').length, alreadyEnabled ? 0 : 1);
  }
});

test('no qualified PR creator means no promotion PR or dispatch is created', async () => {
  const f = fixture();
  await assert.rejects(reconcile({ ...f, createPullRequest: undefined, policyApp, validatedRun: run }));
  assert.equal(f.calls.filter(x => x.body).length, 0);
});

function handoffFixture() {
  const comments = [],
    calls = [];
  const pr = {
    number: 9,
    merged: true,
    merged_at: '2026-11-25T10:00:00Z',
    state: 'closed',
    merge_commit_sha: head,
    base: { ref: 'dev' },
    head: { ref: 'codex/change', repo: { id: 795522855 } },
  };
  return {
    comments,
    calls,
    api: async (path, body) => {
      calls.push({ path, body });
      if (path === '') return { id: 795522855, full_name: 'nguijoel/ontoo-resx', default_branch: 'dev' };
      if (['/branches/dev', '/branches/staging'].includes(path)) return { protected: true };
      if (path === '/git/ref/heads/dev') return { object: { sha: head } };
      if (path === '/git/ref/heads/staging') return { object: { sha: old } };
      if (path === '/commits/' + head + '/pulls?per_page=100') return [pr];
      if (path === '/commits/' + old + '/pulls?per_page=100') return [];
      if (path === '/pulls/9') return pr;
      if (path.includes('/runs?')) return [];
      if (path === '/issues/9/comments?per_page=100') return comments;
      if (path === '/issues/9/comments') {
        const row = { id: 42, user: { id: 123 }, body: body.body };
        comments.push(row);
        return row;
      }
      if (path.endsWith('/dispatches')) return null;
      throw Error('Unexpected handoff request');
    },
  };
}
test('token-suppressed merge handoff reserves once then dispatches exact integration SHA', async () => {
  const f = handoffFixture();
  for (let i = 0; i < 2; i++) await recoverMergeHandoff({ ...f, policyApp, automationActorId: 123, enrolled: true });
  const dispatches = f.calls.filter(x => x.path.endsWith('/dispatches'));
  assert.equal(dispatches.length, 1);
  assert.deepEqual(dispatches[0].body, { ref: 'dev', inputs: { expected_sha: head } });
  assert.equal(f.comments.length, 1);
});
test('uncertain dispatch preserves reservation and never retries automatically', async () => {
  const f = handoffFixture(),
    original = f.api;
  f.api = async (path, ...args) => {
    if (path.endsWith('/dispatches')) throw Error('Synthetic API uncertainty');
    return original(path, ...args);
  };
  await assert.rejects(recoverMergeHandoff({ ...f, policyApp, automationActorId: 123, enrolled: true }));
  f.api = original;
  await recoverMergeHandoff({ ...f, policyApp, automationActorId: 123, enrolled: true });
  assert.equal(f.calls.filter(x => x.path.endsWith('/dispatches')).length, 0);
  assert.equal(f.comments.length, 1);
});
test('disabled handoff and moved tip cannot issue a dispatch', async () => {
  const f = handoffFixture();
  await recoverMergeHandoff({ ...f, policyApp, enrolled: false });
  assert.equal(f.calls.length, 0);
  const original = f.api;
  let refs = 0;
  f.api = async (path, ...args) => (path === '/git/ref/heads/dev' && ++refs > 1 ? { object: { sha: old } } : original(path, ...args));
  await recoverMergeHandoff({ ...f, policyApp, automationActorId: 123, enrolled: true });
  assert.equal(f.calls.filter(x => x.path.endsWith('/dispatches')).length, 0);
  assert.equal(f.comments.length, 0);
});
test('existing failed workflow evidence blocks redispatch; staging cannot accept a feature PR', async () => {
  const f = handoffFixture(),
    original = f.api;
  f.api = async (path, ...args) =>
    path.includes('/runs?') ? [{ head_sha: head, head_branch: 'dev', event: 'workflow_dispatch', conclusion: 'failure' }] : original(path, ...args);
  await recoverMergeHandoff({ ...f, policyApp, automationActorId: 123, enrolled: true });
  assert.equal(f.comments.length, 0);
  assert.equal(f.calls.filter(x => x.path.endsWith('/dispatches')).length, 0);
  const g = handoffFixture(),
    gapi = g.api;
  const foreign = {
    number: 10,
    merged: true,
    merged_at: '2026-11-25T10:00:00Z',
    state: 'closed',
    merge_commit_sha: old,
    base: { ref: 'staging' },
    head: { ref: 'codex/unapproved-route', repo: { id: 795522855 } },
  };
  g.api = async (path, ...args) =>
    path === '/commits/' + head + '/pulls?per_page=100'
      ? []
      : path === '/commits/' + old + '/pulls?per_page=100'
        ? [foreign]
        : path === '/pulls/10'
          ? foreign
          : gapi(path, ...args);
  await assert.rejects(recoverMergeHandoff({ ...g, policyApp, automationActorId: 123, enrolled: true }));
  assert.equal(g.calls.filter(x => x.body).length, 0);
});
function creatorFixture() {
  const calls = [];
  const pr = {
    title: 'Promote validated change',
    body: 'Source/run binding',
    head: 'dev',
    base: 'staging',
    expectedHeadSha: head,
    expectedBaseSha: old,
    draft: false,
  };
  const result = {
    number: 12,
    state: 'open',
    draft: false,
    head: { ref: 'dev', sha: head, repo: { id: 795522855 } },
    base: { ref: 'staging', sha: old },
  };
  const api = async path => (path.startsWith('/pulls?') ? [] : { object: { sha: path.endsWith('/dev') ? head : old } });
  const authoringApi = async (path, body) => {
    calls.push({ path, body });
    return result;
  };
  return { calls, pr, result, api, authoringApi };
}
test('native App creator sends only PR fields and validates exact returned source', async () => {
  const f = creatorFixture();
  await nativeCreator(f)(f.pr);
  assert.deepEqual(f.calls, [{ path: '/pulls', body: { head: 'dev', base: 'staging', title: f.pr.title, body: f.pr.body, draft: false } }]);
});
test('existing exact native PR is recovered without another write', async () => {
  const f = creatorFixture(),
    original = f.api;
  f.api = path => (path.startsWith('/pulls?') ? [f.result] : original(path));
  await nativeCreator(f)(f.pr);
  assert.equal(f.calls.length, 0);
});
test('native creator rejects foreign routes and ref drift before any App write', async () => {
  for (const field of ['expectedHeadSha', 'expectedBaseSha', 'head']) {
    const f = creatorFixture();
    await assert.rejects(nativeCreator(f)({ ...f.pr, [field]: field === 'head' ? 'codex/foreign' : 'e'.repeat(40) }));
    assert.equal(f.calls.length, 0);
  }
});
test('unknown App POST has no in-call retry; wrong returned source fails closed', async () => {
  for (const unknown of [true, false]) {
    const f = creatorFixture();
    let posts = 0;
    f.authoringApi = async () => {
      posts++;
      if (unknown) throw Error('synthetic timeout');
      return { ...f.result, head: { ...f.result.head, sha: old } };
    };
    await assert.rejects(nativeCreator(f)(f.pr));
    assert.equal(posts, 1);
  }
});
test('promotion and ancestry sync preserve original selected refs before native authoring', async () => {
  for (const sync of [false, true])
    for (const moved of ['head', 'base']) {
      const f = fixture(),
        original = f.api;
      let devReads = 0,
        stageReads = 0,
        posts = 0;
      f.api = async (path, ...args) => {
        if (path === '/git/ref/heads/dev') return { object: { sha: ++devReads > 1 && moved === (sync ? 'base' : 'head') ? 'e'.repeat(40) : head } };
        if (path === '/git/ref/heads/staging')
          return { object: { sha: ++stageReads > 1 && moved === (sync ? 'head' : 'base') ? 'e'.repeat(40) : old } };
        if (sync && path.startsWith('/git/commits/')) return { tree: { sha: 'c'.repeat(40) } };
        if (sync && path.startsWith('/compare/')) return { status: 'ahead', merge_base_commit: { sha: head } };
        return original(path, ...args);
      };
      const creator = nativeCreator({
        api: f.api,
        authoringApi: async () => {
          posts++;
        },
      });
      await assert.rejects(
        reconcile({ ...f, validatedRun: sync ? { ...run, head_branch: 'staging', head_sha: old } : run, createPullRequest: creator }),
      );
      assert.equal(posts, 0);
    }
});

test('unprotected target rejects before any native mutation without querying Administration settings', async () => {
  const f = fixture(),
    original = f.api;
  f.api = (path, ...args) => (path === '/branches/staging' ? { protected: false } : original(path, ...args));
  await assert.rejects(reconcile({ ...f, validatedRun: run }));
  assert.equal(f.calls.filter(x => x.body).length, 0);
  assert.equal(
    f.calls.some(x => x.path.endsWith('/protection')),
    false,
  );
});
