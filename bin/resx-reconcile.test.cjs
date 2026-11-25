'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict');
const { requiredChecks, successful, policyBinding, reconcile } = require('./resx-reconcile.cjs');
const head = 'a'.repeat(40),
  old = 'b'.repeat(40),
  policyApp = 999;
function protection(branch) {
  return {
    enforce_admins: { enabled: true },
    required_pull_request_reviews: {},
    allow_force_pushes: { enabled: false },
    allow_deletions: { enabled: false },
    required_conversation_resolution: { enabled: true },
    required_status_checks: {
      strict: true,
      checks: [
        { context: 'RESX CI', app_id: 15368 },
        { context: 'ONTOO policy eligibility ' + branch, app_id: policyApp },
      ],
    },
  };
}
function checks(branch) {
  return [
    { id: 1, name: 'RESX CI', head_sha: head, status: 'completed', conclusion: 'success', app: { id: 15368 } },
    { id: 2, name: 'ONTOO policy eligibility ' + branch, head_sha: head, status: 'completed', conclusion: 'success', app: { id: policyApp } },
  ];
}
test('native protection must bind independent publisher and correct destination', () => {
  requiredChecks(protection('dev'), policyApp, 'dev');
  assert.throws(() => requiredChecks(protection('dev'), policyApp, 'staging'));
  const p = protection('dev');
  p.required_status_checks.checks[1].app_id = 15368;
  assert.throws(() => requiredChecks(p, policyApp, 'dev'));
});
test('latest failure or pending check defeats stale success; destination cannot reuse approval', () => {
  assert.ok(successful(checks('dev'), head, policyApp, 'dev'));
  assert.equal(successful(checks('dev'), head, policyApp, 'staging'), false);
  for (const change of [{ conclusion: 'failure' }, { status: 'in_progress', conclusion: null }])
    assert.equal(successful([...checks('dev'), { ...checks('dev')[1], id: 3, ...change }], head, policyApp, 'dev'), false);
});
function fixture(prs = []) {
  const calls = [];
  const result = {
    calls,
    api: async (path, body) => {
      calls.push({ path, body });
      if (body) return {};
      if (path === '') return { id: 795522855, full_name: 'nguijoel/ontoo-resx', default_branch: 'dev', allow_auto_merge: true };
      if (path.includes('/protection')) return protection(path.includes('/dev/') ? 'dev' : 'staging');
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
test('unvalidated, stale and missing publisher inputs never promote', async () => {
  for (const validatedRun of [null, { ...run, head_sha: old }, { ...run, conclusion: 'failure' }]) {
    const f = fixture();
    await reconcile({ ...f, policyApp, validatedRun });
    assert.equal(f.calls.filter(x => x.body).length, 0);
  }
  await assert.rejects(reconcile({ ...fixture(), policyApp: 15368, validatedRun: run }));
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

test('merge decision rebinds exact PR/base/head/open-PR set and expires; old success cannot authorize moving base', () => {
  const pr = { number: 7, base: { ref: 'dev', sha: old }, head: { sha: head, ref: 'codex/change' } };
  const rows = checks('dev');
  rows[1].output = {
    text: JSON.stringify({
      version: 1,
      repositoryId: 795522855,
      headSha: head,
      destination: 'dev',
      expiresAtMs: 2000,
      pullRequests: [{ number: 7, baseSha: old, headRef: 'codex/change' }],
    }),
  };
  assert.ok(policyBinding(rows, pr, policyApp, [pr], 1000));
  assert.throws(() => policyBinding(rows, { ...pr, base: { ref: 'dev', sha: head } }, policyApp, [pr], 1000));
  assert.throws(() => policyBinding(rows, pr, policyApp, [pr, { ...pr, number: 8 }], 1000));
  assert.throws(() => policyBinding(rows, pr, policyApp, [pr], 3000));
});

test('only the exact unexpired bound decision enables native auto-merge; already enabled is idempotent', async () => {
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

test('canonical JSON member ordering is accepted without ignoring extra binding fields', () => {
  const pr = { number: 7, base: { ref: 'dev', sha: old }, head: { sha: head, ref: 'codex/change' } };
  const rows = checks('dev');
  const record = {
    version: 1,
    repositoryId: 795522855,
    headSha: head,
    destination: 'dev',
    expiresAtMs: 2000,
    pullRequests: [{ baseSha: old, headRef: 'codex/change', number: 7 }],
  };
  rows[1].output = { text: JSON.stringify(record) };
  assert.ok(policyBinding(rows, pr, policyApp, [pr], 1000));
  record.pullRequests[0].unapproved = true;
  rows[1].output.text = JSON.stringify(record);
  assert.throws(() => policyBinding(rows, pr, policyApp, [pr], 1000));
});

test('new relevant PR discovered on final inventory prevents enable and revokes an already armed merge', async () => {
  const pr = {
    number: 7,
    draft: false,
    state: 'open',
    mergeable: true,
    mergeable_state: 'clean',
    node_id: 'synthetic-node',
    auto_merge: { enabled_by: { login: 'github-actions' } },
    base: { ref: 'dev', sha: old },
    head: { sha: head, ref: 'codex/change', repo: { id: 795522855 } },
  };
  const f = fixture([pr]),
    original = f.api;
  let inventories = 0;
  f.api = async (path, body, ...rest) => {
    if (path.startsWith('/pulls?')) return ++inventories === 1 ? [pr] : [pr, { ...pr, number: 8 }];
    if (path === '/git/ref/heads/dev') return { object: { sha: old } };
    if (path.startsWith('/commits/')) {
      const rows = checks('dev');
      rows[1].output = {
        text: JSON.stringify({
          version: 1,
          repositoryId: 795522855,
          headSha: head,
          destination: 'dev',
          expiresAtMs: Date.now() + 30000,
          pullRequests: [{ number: 7, baseSha: old, headRef: 'codex/change' }],
        }),
      };
      return rows;
    }
    if (path === '/pulls/7') return pr;
    return original(path, body, ...rest);
  };
  await reconcile({ ...f, policyApp, validatedRun: null });
  assert.equal(f.calls.filter(x => x.path === '/graphql-enable-auto-merge').length, 0);
  assert.equal(f.calls.filter(x => x.path === '/graphql-disable-auto-merge').length, 1);
});
test('no qualified PR creator means no promotion PR or dispatch is created', async () => {
  const f = fixture();
  await assert.rejects(reconcile({ ...f, createPullRequest: undefined, policyApp, validatedRun: run }));
  assert.equal(f.calls.filter(x => x.body).length, 0);
});
