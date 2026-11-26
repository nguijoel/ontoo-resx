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
    {
      id: 2,
      name: 'RESX risk admission ' + branch,
      head_sha: head,
      status: 'completed',
      conclusion: 'success',
      app: { id: 5919556 },
      output: {
        text: JSON.stringify({
          version: 1,
          repositoryId: 795522855,
          destination: branch,
          headSha: head,
          pullRequests: [{ number: 7, baseSha: old, headRef: 'codex/change', draft: false }],
          results: [],
        }),
      },
    },
  ];
}
test('latest CI failure or pending state defeats stale success', () => {
  assert.ok(successful(checks('dev'), head, 'dev'));
  for (const change of [{ conclusion: 'failure' }, { status: 'in_progress', conclusion: null }])
    assert.equal(successful([...checks('dev'), { ...checks('dev')[0], id: 3, ...change }], head, 'dev'), false);
});
function fixture(prs = []) {
  const calls = [];
  const result = {
    calls,
    api: async (path, body) => {
      calls.push({ path, body });
      if (body) return path.endsWith('/merge') ? { merged: true, sha: 'f'.repeat(40) } : {};
      if (path === '')
        return {
          id: 795522855,
          full_name: 'nguijoel/ontoo-resx',
          default_branch: 'dev',
          allow_auto_merge: true,
          allow_merge_commit: true,
          allow_squash_merge: false,
          allow_rebase_merge: false,
        };
      if (['/branches/dev', '/branches/staging'].includes(path)) return { protected: true };
      if (path === '/git/ref/heads/dev') return { object: { sha: head } };
      if (path === '/git/ref/heads/staging') return { object: { sha: old } };
      if (path.startsWith('/pulls?')) return prs;
      if (path.startsWith('/actions/workflows/')) return { path: '.github/workflows/resx-ci.yml' };
      if (path === '/commits/' + old + '/pulls?per_page=100')
        return [{ number: 11, merge_commit_sha: old, merged_at: '2026-11-25', base: { ref: 'staging' }, head: { ref: 'dev', sha: head } }];
      if (path === '/pulls/11')
        return {
          merged: true,
          state: 'closed',
          merge_commit_sha: old,
          base: { ref: 'staging', repo: { id: 795522855 } },
          head: { sha: head, repo: { id: 795522855 } },
        };
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
    if (path.startsWith('/git/commits/')) return { tree: { sha: 'c'.repeat(40) }, parents: [{ sha: 'f'.repeat(40) }, { sha: head }] };
    if (path.startsWith('/compare/')) return { status: 'ahead', merge_base_commit: { sha: head } };
    return original(path, body, ...rest);
  };
  await reconcile({ ...f, policyApp, validatedRun: { ...run, head_branch: 'staging', head_sha: old } });
  const create = f.calls.find(x => x.path === '/pulls' && x.body);
  assert.equal(create.body.head, 'staging');
  assert.equal(create.body.base, 'dev');
});

test('ready PR uses exact-head native merge for clean or optional-check unstable state; already armed remains native', async () => {
  for (const state of ['clean', 'unstable', 'blocked', 'behind', 'dirty', 'unknown'])
    for (const alreadyEnabled of [false, true]) {
      const pr = {
        number: 7,
        mergeable: true,
        mergeable_state: state,
        draft: false,
        state: 'open',
        node_id: 'synthetic-node',
        auto_merge: alreadyEnabled ? { enabled_by: { login: 'github-actions' } } : null,
        base: { ref: 'dev', sha: old, repo: { id: 795522855, full_name: 'nguijoel/ontoo-resx' } },
        user: { id: 360355133, type: 'Bot' },
        changed_files: 1,
        head: { sha: head, ref: 'codex/change', repo: { id: 795522855, full_name: 'nguijoel/ontoo-resx' } },
      };
      const f = fixture([pr]),
        original = f.api;
      const merges = [];
      f.api = async (path, body, ...rest) => {
        if (path === '/pulls/7/merge') merges.push({ body, method: rest[1] });
        if (path === '/git/ref/heads/dev') return { object: { sha: old } };
        if (path.startsWith('/commits/')) {
          const result = checks('dev');
          return result;
        }
        if (path === '/pulls/7/files?per_page=100') return [{ status: 'modified', filename: require('./resx-risk.cjs').CSS }];
        if (path.startsWith('/contents/'))
          return { encoding: 'base64', size: 40, content: Buffer.from('.search-icon {font-size:1.25rem;}').toString('base64') };
        if (path === '/pulls/7') return pr;
        return original(path, body, ...rest);
      };
      await reconcile({ ...f, policyApp, validatedRun: null });
      assert.equal(merges.length, !alreadyEnabled && ['clean', 'unstable'].includes(state) ? 1 : 0);
      if (merges.length) assert.deepEqual(merges[0], { body: { sha: head, merge_method: 'merge' }, method: 'PUT' });
      assert.equal(f.calls.filter(x => x.path === '/graphql-enable-auto-merge').length, 0);
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
    await assert.rejects(nativeCreator(f)({ ...f.pr, [field]: field === 'head' ? 'feature/foreign' : 'e'.repeat(40) }));
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
        if (sync && path.startsWith('/git/commits/')) return { tree: { sha: 'c'.repeat(40) }, parents: [{ sha: 'f'.repeat(40) }, { sha: head }] };
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

test('shared Actions issuer cannot substitute the independent risk-check issuer', () => {
  const rows = checks('dev');
  rows[1].app.id = 15368;
  assert.equal(successful(rows, head, 'dev'), false);
});
test('App-authored feature PR opens automatically only from exact successful WIP push', async () => {
  const { openFeature } = require('./resx-reconcile.cjs');
  let writes = 0;
  const run = {
    id: 55,
    event: 'push',
    conclusion: 'success',
    head_sha: head,
    head_branch: 'codex/routine',
    workflow_id: 4,
    repository: { id: 795522855 },
  };
  const api = async path =>
    path.startsWith('/actions/workflows/')
      ? { path: '.github/workflows/resx-fast.yml' }
      : path.startsWith('/pulls?')
        ? []
        : { object: { sha: path.endsWith('/dev') ? old : head } };
  await openFeature({
    api,
    run,
    createPullRequest: async pr => {
      writes++;
      assert.equal(pr.expectedHeadSha, head);
      assert.equal(pr.expectedBaseSha, old);
    },
  });
  assert.equal(writes, 1);
  await openFeature({
    api,
    run: { ...run, conclusion: 'failure' },
    createPullRequest: async () => {
      writes++;
    },
  });
  assert.equal(writes, 1);
});

test('enrollment recovers already-successful current-tip CI without a manual dispatch edge', async () => {
  const { latestValidatedTip } = require('./resx-reconcile.cjs'),
    f = fixture(),
    original = f.api;
  f.api = async (path, ...args) =>
    path.includes('/runs?') ? (path.includes('branch=dev') ? [{ ...run, event: 'push', status: 'completed' }] : []) : original(path, ...args);
  await reconcile({ ...f, validatedRun: await latestValidatedTip(f.api) });
  assert.equal(f.calls.filter(x => x.path === '/pulls' && x.body).length, 1);
  const api = async (path, ...args) =>
    path.includes('/runs?')
      ? path.includes('branch=dev')
        ? [
            { ...run, event: 'push', status: 'completed' },
            { ...run, id: 2, event: 'workflow_dispatch', status: 'completed', conclusion: 'failure' },
          ]
        : []
      : original(path, ...args);
  assert.equal(await latestValidatedTip(api), null);
});
test('exact reviewed staging merge can sync from validated dev without suppressed staging push CI', async () => {
  const f = fixture(),
    original = f.api;
  f.api = async (path, ...args) =>
    path.startsWith('/git/commits/')
      ? { tree: { sha: 'c'.repeat(40) }, parents: [{ sha: 'f'.repeat(40) }, { sha: head }] }
      : path.startsWith('/compare/')
        ? { status: 'ahead', merge_base_commit: { sha: head } }
        : original(path, ...args);
  await reconcile({ ...f, validatedRun: run });
  assert.equal(f.calls.find(x => x.path === '/pulls' && x.body).body.head, 'staging');
});
test('already-synced identical trees are a no-op, not another promotion or sync', async () => {
  const f = fixture(),
    original = f.api;
  f.api = async (path, ...args) =>
    path.startsWith('/git/commits/')
      ? { tree: { sha: 'c'.repeat(40) } }
      : path.startsWith('/compare/')
        ? { status: 'behind', merge_base_commit: { sha: old } }
        : original(path, ...args);
  await reconcile({ ...f, validatedRun: run });
  assert.equal(f.calls.filter(x => x.body).length, 0);
});

test('actual main HTTP adapter preserves PUT and exact SHA for an eligible ready merge', async () => {
  const fs = require('node:fs'),
    os = require('node:os'),
    path = require('node:path');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'resx-native-http-'));
  const event = path.join(directory, 'event.json');
  fs.writeFileSync(event, '{}');
  const keys = ['GITHUB_REPOSITORY', 'GITHUB_REF', 'GITHUB_EVENT_PATH', 'GH_TOKEN', 'GH_APP_TOKEN', 'GH_RISK_TOKEN', 'RESX_PRE_ENROLLED'];
  const before = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  const originalFetch = globalThis.fetch;
  const pr = {
    number: 7,
    mergeable: true,
    mergeable_state: 'clean',
    draft: false,
    state: 'open',
    auto_merge: null,
    base: { ref: 'dev', sha: old, repo: { id: 795522855, full_name: 'nguijoel/ontoo-resx' } },
    head: { ref: 'codex/change', sha: head, repo: { id: 795522855, full_name: 'nguijoel/ontoo-resx' } },
    user: { id: 360355133, type: 'Bot' },
    changed_files: 1,
  };
  const f = fixture([pr]),
    merges = [];
  try {
    for (const k of keys) delete process.env[k];
    Object.assign(process.env, {
      GITHUB_REPOSITORY: 'nguijoel/ontoo-resx',
      GITHUB_REF: 'refs/heads/dev',
      GITHUB_EVENT_PATH: event,
      GH_TOKEN: 'synthetic-workflow-token',
    });
    globalThis.fetch = async (url, options) => {
      const parsed = new URL(url);
      assert.equal(parsed.origin, 'https://api.github.com');
      const route = (parsed.pathname.replace('/repos/nguijoel/ontoo-resx', '') + parsed.search).replace(/&page=\d+$/, '');
      let value;
      if (route === '/pulls/7/merge') {
        merges.push({ method: options.method, body: JSON.parse(options.body) });
        value = { merged: true, sha: 'f'.repeat(40) };
      } else if (route === '/git/ref/heads/dev') value = { object: { sha: old } };
      else if (route.startsWith('/actions/workflows/resx-ci.yml/runs?')) value = { workflow_runs: [] };
      else if (route.startsWith('/commits/')) value = { check_runs: checks('dev') };
      else if (route === '/pulls/7/files?per_page=100') value = [{ status: 'modified', filename: require('./resx-risk.cjs').CSS }];
      else if (route.startsWith('/contents/'))
        value = { encoding: 'base64', size: 40, content: Buffer.from('.search-icon {font-size:1.25rem;}').toString('base64') };
      else if (route === '/pulls/7') value = pr;
      else value = await f.api(route);
      return new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    await require('./resx-reconcile.cjs').main();
    assert.deepEqual(merges, [{ method: 'PUT', body: { sha: head, merge_method: 'merge' } }]);
  } finally {
    globalThis.fetch = originalFetch;
    for (const k of keys) {
      if (before[k] === undefined) delete process.env[k];
      else process.env[k] = before[k];
    }
    fs.unlinkSync(event);
    fs.rmdirSync(directory);
  }
});
