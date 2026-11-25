'use strict';
// Trusted default-branch orchestration only. Never execute a PR checkout here.
const { REPOSITORY, REPOSITORY_ID } = require('./resx-cicd.cjs');
const CI_APP = 15368;
const SHA = /^[a-f0-9]{40}$/;
function assert(v) {
  if (!v) throw Error('RESX_RECONCILIATION_REJECTED');
}
function requiredChecks(protection, policyApp, branch) {
  assert(
    protection.enforce_admins?.enabled === true &&
      protection.required_pull_request_reviews &&
      protection.allow_force_pushes?.enabled === false &&
      protection.allow_deletions?.enabled === false &&
      protection.required_conversation_resolution?.enabled === true,
  );
  assert(protection.required_status_checks?.strict === true);
  const checks = protection.required_status_checks.checks || [];
  assert(checks.some(x => x.context === 'RESX CI' && x.app_id === CI_APP));
  assert(checks.some(x => x.context === 'ONTOO policy eligibility ' + branch && x.app_id === policyApp));
}
function successful(checks, sha, policyApp, branch) {
  return [
    ['RESX CI', CI_APP],
    ['ONTOO policy eligibility ' + branch, policyApp],
  ].every(([name, id]) => {
    const latest = checks.filter(c => c.name === name && c.app?.id === id && c.head_sha === sha).sort((a, b) => b.id - a.id)[0];
    return latest?.status === 'completed' && latest.conclusion === 'success';
  });
}
function policyBinding(checks, pr, policyApp, openPulls, now = Date.now()) {
  const found = checks
    .filter(c => c.name === 'ONTOO policy eligibility ' + pr.base.ref && c.app?.id === policyApp && c.head_sha === pr.head.sha)
    .sort((a, b) => b.id - a.id)[0];
  assert(
    found?.status === 'completed' && found.conclusion === 'success' && typeof found.output?.text === 'string' && found.output.text.length <= 65536,
  );
  let record;
  try {
    record = JSON.parse(found.output.text);
  } catch {
    throw Error('RESX_POLICY_BINDING_REJECTED');
  }
  assert(
    record.version === 1 &&
      record.repositoryId === REPOSITORY_ID &&
      record.headSha === pr.head.sha &&
      record.destination === pr.base.ref &&
      Number.isSafeInteger(record.expiresAtMs) &&
      record.expiresAtMs > now &&
      record.expiresAtMs <= now + 300000 &&
      Array.isArray(record.pullRequests),
  );
  const relevant = openPulls
    .filter(p => p.base.ref === pr.base.ref && p.head.sha === pr.head.sha)
    .map(p => ({ number: p.number, baseSha: p.base.sha, headRef: p.head.ref }))
    .sort((a, b) => a.number - b.number);
  const bound = [...record.pullRequests].sort((a, b) => a.number - b.number);
  assert(
    bound.every(
      p =>
        p &&
        Object.keys(p).length === 3 &&
        ['number', 'baseSha', 'headRef'].every(k => Object.hasOwn(p, k)) &&
        Number.isSafeInteger(p.number) &&
        p.number > 0 &&
        SHA.test(p.baseSha || '') &&
        typeof p.headRef === 'string',
    ),
  );
  const tuples = rows => rows.map(p => [p.number, p.baseSha, p.headRef]);
  assert(
    JSON.stringify(tuples(relevant)) === JSON.stringify(tuples(bound)) && relevant.some(p => p.number === pr.number && p.baseSha === pr.base.sha),
  );
  return record;
}
async function reconcile({ api, policyApp, validatedRun, createPullRequest }) {
  assert(Number.isSafeInteger(policyApp) && policyApp > 0 && policyApp !== CI_APP);
  const repo = await api('');
  assert(repo.id === REPOSITORY_ID && repo.full_name === REPOSITORY && repo.default_branch === 'dev' && repo.allow_auto_merge === true);
  for (const branch of ['dev', 'staging']) requiredChecks(await api('/branches/' + branch + '/protection'), policyApp, branch);
  const dev = await api('/git/ref/heads/dev'),
    stage = await api('/git/ref/heads/staging');
  assert(SHA.test(dev.object.sha) && SHA.test(stage.object.sha));
  // Paginate full PR inventory; do not silently ignore a second PR for one head.
  const prs = await api('/pulls?state=open&per_page=100', null, true);
  for (const pr of prs) {
    if (pr.draft || !['dev', 'staging'].includes(pr.base.ref) || pr.head.repo?.id !== REPOSITORY_ID) continue;
    if (pr.base.ref === 'staging' && (pr.head.ref !== 'dev' || pr.head.sha !== dev.object.sha)) continue;
    const checks = await api('/commits/' + pr.head.sha + '/check-runs?per_page=100', null, 'check_runs');
    if (!successful(checks, pr.head.sha, policyApp, pr.base.ref)) continue;
    const fresh = await api('/pulls/' + pr.number);
    if (fresh.head.sha !== pr.head.sha || fresh.draft || fresh.state !== 'open') continue;
    const currentBase = await api('/git/ref/heads/' + fresh.base.ref);
    if (currentBase.object.sha !== fresh.base.sha) continue;
    const currentPulls = await api('/pulls?state=open&per_page=100', null, true);
    try {
      policyBinding(checks, fresh, policyApp, currentPulls);
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
        body: 'Ancestry only: exact current dev/staging full Git trees match. Independent eligibility must verify current refs and prior promotion; no application/config/schema content change.',
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
        'CI/CD-POC-001 protected promotion. Source ' +
        dev.object.sha +
        '; validated run ' +
        validatedRun.id +
        '. Independent policy eligibility and native branch checks remain required. No direct push or PROD operation.',
    });
    // PR creation must use the qualified App broker. Dispatch checks cannot
    // satisfy native required PR checks and are not a substitute.
  }
  // Existing promotion: no repeat dispatch, preventing workflow_run recursion.
}
// Recover token-suppressed push events. This schedules work; it never authorizes
// a merge or deployment. A visible bot-authored intent prevents redispatch
// after an uncertain dispatch result. Comment-creation ambiguity can cause a
// metadata retry; only the locked controller enforces deployment idempotency.
// The worker validates the exact SHA again.
async function recoverMergeHandoff({ api, policyApp, automationActorId, enrolled }) {
  if (!enrolled) return;
  assert(Number.isSafeInteger(policyApp) && policyApp > 0 && policyApp !== CI_APP);
  assert(Number.isSafeInteger(automationActorId) && automationActorId > 0);
  const repo = await api('');
  assert(repo.id === REPOSITORY_ID && repo.full_name === REPOSITORY && repo.default_branch === 'dev');
  for (const branch of ['dev', 'staging']) {
    requiredChecks(await api('/branches/' + branch + '/protection'), policyApp, branch);
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
function brokerCreator({ api, fetchImpl = fetch, requestUrl, requestToken, recordIntent = row => console.log(JSON.stringify(row)) }) {
  async function boundedJson(response, maximum) {
    assert(response.body);
    const chunks = [];
    let bytes = 0;
    for await (const chunk of response.body) {
      bytes += chunk.length;
      assert(bytes <= maximum);
      chunks.push(Buffer.from(chunk));
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }
  // Fixed trusted endpoint. Candidate workflows never receive the App key/token.
  return async pr => {
    assert(pr?.draft === false && typeof pr.title === 'string' && pr.title.length > 0 && pr.title.length <= 200);
    assert(typeof pr.body === 'string' && Buffer.byteLength(pr.body) <= 16000);
    assert((pr.head === 'dev' && pr.base === 'staging') || (pr.head === 'staging' && pr.base === 'dev'));
    const headSha = pr.expectedHeadSha,
      baseSha = pr.expectedBaseSha;
    assert(SHA.test(headSha || '') && SHA.test(baseSha || ''));
    assert((await api('/git/ref/heads/' + pr.head)).object.sha === headSha);
    assert((await api('/git/ref/heads/' + pr.base)).object.sha === baseSha);
    const intent = {
      operation: 'create',
      repositoryId: REPOSITORY_ID,
      head: pr.head,
      base: pr.base,
      expectedHeadSha: headSha,
      expectedBaseSha: baseSha,
    };
    // Exclude presentation/run IDs so a timeout cannot be retried under a new ID.
    const requestId = require('node:crypto').createHash('sha256').update(JSON.stringify(intent)).digest('hex');
    const packet = { ...intent, requestId, title: pr.title, body: pr.body };
    const body = JSON.stringify(packet);
    assert(Buffer.byteLength(body) <= 32768 && typeof requestToken === 'string' && requestToken.length > 0);
    const url = new URL(requestUrl);
    assert(
      url.protocol === 'https:' &&
        !url.username &&
        !url.password &&
        (!url.port || url.port === '443') &&
        url.hostname.endsWith('.actions.githubusercontent.com'),
    );
    url.searchParams.set('audience', 'ontoo-resx-authoring');
    const tokenResponse = await fetchImpl(url, {
      headers: { Authorization: 'Bearer ' + requestToken },
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
    assert(tokenResponse.status === 200);
    const tokenData = await boundedJson(tokenResponse, 32768);
    assert(typeof tokenData.value === 'string' && tokenData.value.length > 0 && tokenData.value.length <= 16384);
    recordIntent({ event: 'ONTOO_AUTHORING_REQUEST', requestId, repositoryId: REPOSITORY_ID, headSha, baseSha });
    // Do not log responses: even error bodies are not operational evidence here.
    const response = await fetchImpl('https://resx-preview.ontoo.cloud/.well-known/ontoo-release/resx-authoring', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + tokenData.value, 'Content-Type': 'application/json' },
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(120000),
    });
    if (response.status !== 200) throw Error('AUTHORING_UNCONFIRMED_PRESERVE_REQUEST_ID');
    const result = await boundedJson(response, 8192);
    assert(result && Object.keys(result).sort().join(',') === 'automaticRetry,baseSha,headSha,number,outcome,requestId');
    assert(['created', 'existing'].includes(result.outcome) && result.requestId === requestId && result.automaticRetry === false);
    assert(Number.isSafeInteger(result.number) && result.number > 0 && result.headSha === headSha && result.baseSha === baseSha);
    return result;
  };
}
async function main() {
  const fs = require('node:fs');
  assert(process.env.GITHUB_REPOSITORY === REPOSITORY && process.env.GITHUB_REF === 'refs/heads/dev');
  const policyApp = Number(process.env.RESX_POLICY_APP_ID),
    token = process.env.GH_TOKEN;
  assert(token);
  const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  if (event.workflow_run && event.workflow_run.conclusion !== 'success') return;
  const api = async (path, body, pagination) => {
    if (path === '/graphql-enable-auto-merge' || path === '/graphql-disable-auto-merge') {
      const r = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
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
        method: body ? 'POST' : 'GET',
        headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
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
  const createPullRequest =
    process.env.RESX_AUTHORING_ENROLLED === 'true'
      ? brokerCreator({ api, requestUrl: process.env.ACTIONS_ID_TOKEN_REQUEST_URL, requestToken: process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN })
      : undefined;
  await reconcile({ api, policyApp, validatedRun: event.workflow_run, createPullRequest });
  await recoverMergeHandoff({
    api,
    policyApp,
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
module.exports = { requiredChecks, successful, policyBinding, reconcile, recoverMergeHandoff, brokerCreator };
