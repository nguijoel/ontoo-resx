'use strict';
// Trusted default-branch orchestration only. Never execute a PR checkout here.
const { REPOSITORY, REPOSITORY_ID } = require('./resx-cicd.cjs');
const CI_APP = 15368;
const risk = require('./resx-risk.cjs');
const SHA = /^[a-f0-9]{40}$/;
function assert(v) {
  if (!v) throw Error('RESX_RECONCILIATION_REJECTED');
}
function successful(checks, sha, branch) {
  const latest = checks.filter(c => c.name === 'RESX CI' && c.app?.id === CI_APP && c.head_sha === sha).sort((a, b) => b.id - a.id)[0];
  const proof = checks
    .filter(c => c.name === 'RESX risk admission ' + branch && c.app?.id === 5919556 && c.head_sha === sha)
    .sort((a, b) => b.id - a.id)[0];
  return latest?.status === 'completed' && latest.conclusion === 'success' && proof?.status === 'completed' && proof.conclusion === 'success';
}
async function reconcile({ api, validatedRun, createPullRequest }) {
  const repo = await api('');
  assert(
    repo.id === REPOSITORY_ID &&
      repo.full_name === REPOSITORY &&
      repo.default_branch === 'dev' &&
      repo.allow_auto_merge === true &&
      repo.allow_merge_commit === true &&
      repo.allow_squash_merge === false &&
      repo.allow_rebase_merge === false,
  );
  // Native merge enforcement is authoritative. Full rule settings are verified
  // by the configuration operator before enrollment, not via an Admin-scoped token.
  for (const branch of ['dev', 'staging']) assert((await api('/branches/' + branch)).protected === true);
  const dev = await api('/git/ref/heads/dev'),
    stage = await api('/git/ref/heads/staging');
  assert(SHA.test(dev.object.sha) && SHA.test(stage.object.sha));
  // Paginate full PR inventory; do not silently ignore a second PR for one head.
  const prs = await api('/pulls?state=open&per_page=100', null, true);
  for (const pr of prs) {
    if (pr.draft || !['dev', 'staging'].includes(pr.base.ref) || pr.head.repo?.id !== REPOSITORY_ID) continue;
    if (pr.base.ref === 'staging' && (pr.head.ref !== 'dev' || pr.head.sha !== dev.object.sha)) continue;
    const checks = await api('/commits/' + pr.head.sha + '/check-runs?per_page=100', null, 'check_runs');
    if (!successful(checks, pr.head.sha, pr.base.ref)) continue;
    const fresh = await api('/pulls/' + pr.number);
    if (fresh.head.sha !== pr.head.sha || fresh.draft || fresh.state !== 'open') continue;
    const currentBase = await api('/git/ref/heads/' + fresh.base.ref);
    if (currentBase.object.sha !== fresh.base.sha) continue;
    try {
      risk.bound(checks, fresh, await api('/pulls?state=open&per_page=100', null, true));
    } catch {
      continue;
    }
    // Re-read live review/source evidence after CI, immediately before arming.
    try {
      await risk.evaluate(api, fresh);
    } catch {
      if (fresh.auto_merge) await api('/graphql-disable-auto-merge', { nodeId: fresh.node_id });
      continue;
    }
    // Do not arm a deferred merge while native conversations/checks are unresolved.
    if (fresh.mergeable !== true || fresh.mergeable_state !== 'clean') continue;
    // Native merge checks/reviews remain authoritative and are never bypassed.
    if (!fresh.auto_merge) await api('/graphql-enable-auto-merge', { nodeId: fresh.node_id });
  }
  // Promotion is a protected PR, not a direct branch write. Only the current
  // successful dev run can create it; arbitrary dispatches cannot invent validation.
  if (!validatedRun || !['dev', 'staging'].includes(validatedRun.head_branch) || validatedRun.conclusion !== 'success') return;
  const expected = validatedRun.head_branch === 'dev' ? dev.object.sha : stage.object.sha;
  if (validatedRun.head_sha !== expected) return;
  assert(validatedRun.repository?.id === REPOSITORY_ID);
  const workflow = await api('/actions/workflows/' + validatedRun.workflow_id);
  assert(workflow.path === '.github/workflows/resx-ci.yml');
  const devCommit = await api('/git/commits/' + dev.object.sha),
    stageCommit = await api('/git/commits/' + stage.object.sha);
  assert(SHA.test(devCommit.tree?.sha || '') && SHA.test(stageCommit.tree?.sha || ''));
  if (devCommit.tree.sha === stageCommit.tree.sha) {
    if (dev.object.sha === stage.object.sha || validatedRun.head_branch !== 'staging') return;
    const ancestry = await api('/compare/' + dev.object.sha + '...' + stage.object.sha);
    assert(ancestry.status === 'ahead' && ancestry.merge_base_commit?.sha === dev.object.sha);
    const sync = prs.filter(p => p.base.ref === 'dev' && p.head.ref === 'staging' && p.head.repo?.id === REPOSITORY_ID);
    assert(sync.length <= 1);
    if (!sync.length) {
      assert(typeof createPullRequest === 'function');
      await createPullRequest({
        title: 'Synchronize verified RESX promotion ancestry',
        head: 'staging',
        base: 'dev',
        expectedHeadSha: stage.object.sha,
        expectedBaseSha: dev.object.sha,
        draft: false,
        body: 'Ancestry only: exact current dev/staging full Git trees match. Native required checks and code-owner reviews remain authoritative; no application/config/schema content change.',
      });
      // A qualified App-authored PR triggers normal pull_request CI, not dispatch checks.
    }
    return;
  }
  if (validatedRun.head_branch !== 'dev') return;
  const comparison = await api('/compare/' + stage.object.sha + '...' + dev.object.sha);
  assert(comparison.status === 'ahead' && comparison.merge_base_commit?.sha === stage.object.sha);
  const existing = prs.filter(p => p.base.ref === 'staging' && p.head.ref === 'dev' && p.head.repo?.id === REPOSITORY_ID);
  assert(existing.length <= 1);
  if (!existing.length) {
    assert(typeof createPullRequest === 'function');
    await createPullRequest({
      title: 'Promote validated RESX dev to staging',
      head: 'dev',
      base: 'staging',
      expectedHeadSha: dev.object.sha,
      expectedBaseSha: stage.object.sha,
      draft: false,
      body:
        'GOV-CICD-001 protected promotion. Source ' +
        dev.object.sha +
        '; validated run ' +
        validatedRun.id +
        '. Native required checks and code-owner reviews remain required. No direct push or PROD operation.',
    });
    // PR creation must use the repository-scoped App installation token. Dispatch checks cannot
    // satisfy native required PR checks and are not a substitute.
  }
  // Existing promotion: no repeat dispatch, preventing workflow_run recursion.
}
// Recover token-suppressed push events. This schedules work; it never authorizes
// a merge or deployment. A visible bot-authored intent prevents redispatch
// after an uncertain dispatch result. Comment-creation ambiguity can cause a
// metadata retry; only the locked controller enforces deployment idempotency.
// The worker validates the exact SHA again.
async function recoverMergeHandoff({ api, automationActorId, enrolled }) {
  if (!enrolled) return;
  assert(Number.isSafeInteger(automationActorId) && automationActorId > 0);
  const repo = await api('');
  assert(repo.id === REPOSITORY_ID && repo.full_name === REPOSITORY && repo.default_branch === 'dev');
  for (const branch of ['dev', 'staging']) {
    assert((await api('/branches/' + branch)).protected === true);
    const sha = (await api('/git/ref/heads/' + branch)).object.sha;
    assert(SHA.test(sha));
    const pulls = await api('/commits/' + sha + '/pulls?per_page=100', null, true);
    const candidates = pulls.filter(p => p.merge_commit_sha === sha && p.merged_at && p.state === 'closed' && p.base.ref === branch);
    if (!candidates.length) continue;
    assert(candidates.length === 1);
    const pr = await api('/pulls/' + candidates[0].number);
    assert(pr.merged === true && pr.merge_commit_sha === sha && pr.base.ref === branch && pr.head.repo?.id === REPOSITORY_ID);
    if (branch === 'staging') assert(pr.head.ref === 'dev');
    const workflow = branch === 'dev' ? 'resx-ci.yml' : 'resx-release.yml';
    const runs = await api('/actions/workflows/' + workflow + '/runs?head_sha=' + sha + '&per_page=100', null, 'workflow_runs');
    // Failed/cancelled runs are evidence too: do not silently retry them.
    if (runs.some(r => r.head_sha === sha && r.head_branch === branch && ['push', 'workflow_dispatch'].includes(r.event))) continue;
    const prefix = '<!-- ONTOO_MERGE_HANDOFF_V1\n';
    const comments = await api('/issues/' + pr.number + '/comments?per_page=100', null, true);
    let reserved = false;
    for (const comment of comments) {
      if (comment.user?.id !== automationActorId || !comment.body?.startsWith(prefix)) continue;
      let row;
      try {
        row = JSON.parse(comment.body.slice(prefix.length, -4));
      } catch {
        throw Error('HANDOFF_EVIDENCE_INVALID');
      }
      if (row.repositoryId === REPOSITORY_ID && row.branch === branch && row.sourceSha === sha) reserved = true;
    }
    if (reserved) continue;
    const binding = { repositoryId: REPOSITORY_ID, pullRequest: pr.number, branch, sourceSha: sha, workflow, state: 'RESERVED_NO_AUTOMATIC_RETRY' };
    if ((await api('/git/ref/heads/' + branch)).object.sha !== sha) continue;
    const intentBody = prefix + JSON.stringify(binding) + '\n-->';
    const intent = await api('/issues/' + pr.number + '/comments', { body: intentBody });
    assert(Number.isSafeInteger(intent.id) && intent.user?.id === automationActorId && intent.body === intentBody);
    // Any error after reservation remains visible and needs reconciliation.
    if ((await api('/git/ref/heads/' + branch)).object.sha !== sha) throw Error('HANDOFF_REF_MOVED_PRESERVE_INTENT');
    await api('/actions/workflows/' + workflow + '/dispatches', {
      ref: branch,
      inputs: branch === 'dev' ? { expected_sha: sha } : { action: 'deploy', expected_sha: sha },
    });
  }
}
function nativeCreator({ api, authoringApi }) {
  return async pr => {
    assert(pr?.draft === false && typeof pr.title === 'string' && pr.title.length > 0 && pr.title.length <= 200);
    assert(typeof pr.body === 'string' && Buffer.byteLength(pr.body) <= 16000);
    assert(
      (pr.head === 'dev' && pr.base === 'staging') ||
        (pr.head === 'staging' && pr.base === 'dev') ||
        (pr.base === 'dev' &&
          /^codex\/[a-z0-9][a-z0-9._/-]{0,100}$/i.test(pr.head) &&
          !pr.head.includes('..') &&
          !pr.head.includes('//') &&
          !pr.head.endsWith('/')),
    );
    assert(SHA.test(pr.expectedHeadSha || '') && SHA.test(pr.expectedBaseSha || ''));
    assert((await api('/git/ref/heads/' + pr.head)).object.sha === pr.expectedHeadSha);
    assert((await api('/git/ref/heads/' + pr.base)).object.sha === pr.expectedBaseSha);
    // Recover an existing request by its native PR identity, never blindly repeat POST.
    const existing = await api('/pulls?state=open&head=nguijoel:' + pr.head + '&base=' + pr.base + '&per_page=100', null, true);
    assert(existing.length <= 1);
    const result =
      existing[0] ||
      (await authoringApi('/pulls', {
        head: pr.head,
        base: pr.base,
        title: pr.title,
        body: pr.body,
        draft: false,
      }));
    assert(
      Number.isSafeInteger(result.number) &&
        result.number > 0 &&
        result.head?.repo?.id === REPOSITORY_ID &&
        result.head.sha === pr.expectedHeadSha &&
        result.base?.sha === pr.expectedBaseSha &&
        result.head.ref === pr.head &&
        result.base.ref === pr.base &&
        result.state === 'open' &&
        result.draft === false,
    );
    console.log(
      JSON.stringify({
        event: 'ONTOO_APP_PR',
        repositoryId: REPOSITORY_ID,
        number: result.number,
        headSha: pr.expectedHeadSha,
        baseSha: pr.expectedBaseSha,
      }),
    );
    return result;
  };
}
async function openFeature({ api, run, createPullRequest }) {
  if (!run || run.conclusion !== 'success' || run.event !== 'push' || !/^codex\/[a-z0-9][a-z0-9._/-]{0,100}$/i.test(run.head_branch || '')) return;
  assert(run.repository?.id === REPOSITORY_ID && SHA.test(run.head_sha));
  assert((await api('/actions/workflows/' + run.workflow_id)).path === '.github/workflows/resx-fast.yml');
  if ((await api('/git/ref/heads/' + run.head_branch)).object.sha !== run.head_sha) return;
  const base = (await api('/git/ref/heads/dev')).object.sha;
  const prs = await api('/pulls?state=open&per_page=100', null, true);
  const existing = prs.filter(p => p.base.ref === 'dev' && p.head.ref === run.head_branch && p.head.repo?.id === REPOSITORY_ID);
  assert(existing.length <= 1);
  if (existing.length) return;
  assert(typeof createPullRequest === 'function');
  await createPullRequest({
    head: run.head_branch,
    base: 'dev',
    expectedHeadSha: run.head_sha,
    expectedBaseSha: base,
    draft: false,
    title: 'Integrate validated ' + run.head_branch,
    body:
      'Automatic App-authored PR after WIP feedback run ' +
      run.id +
      '. Normal pull_request CI and trusted risk admission remain mandatory; WIP feedback is not merge approval.',
  });
}
async function main() {
  const fs = require('node:fs');
  assert(process.env.GITHUB_REPOSITORY === REPOSITORY && process.env.GITHUB_REF === 'refs/heads/dev');
  const token = process.env.GH_TOKEN,
    authoringToken = process.env.GH_APP_TOKEN,
    riskToken = process.env.GH_RISK_TOKEN;
  assert(token);
  const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  if (event.workflow_run && event.workflow_run.conclusion !== 'success') return;
  const request = async (authToken, path, body, pagination, method) => {
    if (path === '/graphql-enable-auto-merge' || path === '/graphql-disable-auto-merge') {
      const r = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + authToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query:
            path === '/graphql-enable-auto-merge'
              ? 'mutation($id:ID!){enablePullRequestAutoMerge(input:{pullRequestId:$id,mergeMethod:MERGE}){pullRequest{id}}}'
              : 'mutation($id:ID!){disablePullRequestAutoMerge(input:{pullRequestId:$id}){pullRequest{id}}}',
          variables: { id: body.nodeId },
        }),
        redirect: 'error',
        signal: AbortSignal.timeout(20000),
      });
      assert(r.ok);
      const d = await r.json();
      assert(!d.errors);
      return d.data;
    }
    let output = [];
    for (let page = 1; page <= 30; page++) {
      const suffix = pagination ? (path.includes('?') ? '&' : '?') + 'page=' + page : '';
      const r = await fetch('https://api.github.com/repos/' + REPOSITORY + path + suffix, {
        method: method || (body ? 'POST' : 'GET'),
        headers: { Authorization: 'Bearer ' + authToken, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        redirect: 'error',
        signal: AbortSignal.timeout(20000),
      });
      assert(r.ok);
      if (r.status === 204) return null;
      const d = await r.json();
      if (!pagination) return d;
      const rows = pagination === true ? d : d[pagination];
      assert(Array.isArray(rows));
      output.push(...rows);
      if (rows.length < 100) return output;
    }
    throw Error('PAGINATION_INCOMPLETE');
  };
  const api = (path, body, pagination) => request(token, path, body, pagination);
  const createPullRequest = authoringToken ? nativeCreator({ api, authoringApi: (path, body) => request(authoringToken, path, body) }) : undefined;
  if (riskToken)
    await risk.publish({
      api,
      checkApi: (path, body, method) => request(riskToken, path, body, undefined, method),
      pulls: await api('/pulls?state=open&per_page=100', null, true),
    });
  await reconcile({ api, validatedRun: event.workflow_run, createPullRequest });
  await openFeature({ api, run: event.workflow_run, createPullRequest });
  await recoverMergeHandoff({
    api,
    automationActorId: Number(process.env.RESX_AUTOMATION_ACTOR_ID),
    enrolled: process.env.RESX_PRE_ENROLLED === 'true',
  });
  console.log('Protected RESX reconciliation completed; no direct branch/deployment write.');
}
if (require.main === module)
  main().catch(() => {
    console.error('RESX_RECONCILIATION_REJECTED');
    process.exitCode = 1;
  });
module.exports = { successful, reconcile, recoverMergeHandoff, nativeCreator, openFeature };
