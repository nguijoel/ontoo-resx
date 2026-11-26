'use strict';
// Trusted dev workflow only; read GitHub metadata, never execute candidate code.
const c = require('./resx-cicd.cjs');
const SHA = /^[a-f0-9]{40}$/;
const REVIEWERS = [6606980];
const BASELINE = {
  sha: 'edbf651e8c7fdb6b51f5e8635b4f681f0ce25f82',
  parent: 'ed287c2c10ca9c14a151c862a891de968334d210',
  tree: 'd3d6602900bd5f72a7d24dc753a47ac2252de63e',
};
const CSS = 'webapp/src/app/shared/components/search/search.component.css';
function demand(ok) {
  if (!ok) throw Error('RESX_RISK_ADMISSION_REJECTED');
}
async function filesFor(api, pr) {
  const rows = await api('/pulls/' + pr.number + '/files?per_page=100', null, true);
  demand(Number.isSafeInteger(pr.changed_files) && pr.changed_files === rows.length && rows.length <= 3000);
  return rows;
}
async function material(api, pr, files) {
  if (!files.length) return true;
  let owned = false;
  for (const f of files) {
    const delegated = ['README.md', 'CHANGELOG.md', CSS].includes(f.filename);
    if (delegated) demand(f.status === 'modified' && !f.previous_filename);
    else {
      owned = true;
      continue;
    }
    if (['README.md', 'CHANGELOG.md'].includes(f.filename)) continue;
    if (f.filename !== CSS) return true;
    const body = await api('/contents/' + CSS + '?ref=' + pr.head.sha);
    demand(body.encoding === 'base64' && body.size <= 4096 && typeof body.content === 'string');
    const text = Buffer.from(body.content, 'base64').toString('utf8');
    // Approved routine presentation envelope only. New imports/URLs/selectors,
    // properties or broader CSS changes require material review.
    if (!/^\s*\.search-icon\s*\{\s*font-size:\s*(?:1\.25|1\.375)rem;\s*(?:line-height:\s*1;\s*)?\}\s*$/.test(text)) demand(false);
  }
  return owned;
}
function identity(pr) {
  demand(
    pr &&
      Number.isSafeInteger(pr.number) &&
      pr.head?.repo?.id === c.REPOSITORY_ID &&
      pr.base?.repo?.id === c.REPOSITORY_ID &&
      pr.head.repo.full_name === c.REPOSITORY &&
      pr.base.repo.full_name === c.REPOSITORY &&
      SHA.test(pr.head.sha) &&
      SHA.test(pr.base.sha),
  );
}
async function approvedSource(api, pr) {
  identity(pr);
  const files = await filesFor(api, pr);
  const protectedChange = await material(api, pr, files);
  let approval = null;
  if (protectedChange) {
    const reviews = await api('/pulls/' + pr.number + '/reviews?per_page=100', null, true);
    demand(c.latestHumanApproval(pr, reviews, REVIEWERS));
    const accepted = reviews
      .filter(
        r =>
          r.state === 'APPROVED' &&
          r.commit_id === pr.head.sha &&
          r.user?.type === 'User' &&
          REVIEWERS.includes(r.user.id) &&
          r.user.id !== pr.user?.id,
      )
      .sort((a, b) => b.id - a.id)[0];
    demand(Number.isSafeInteger(accepted?.id) && accepted.id > 0);
    approval = { reviewId: accepted.id, reviewerId: accepted.user.id, commitSha: accepted.commit_id };
  }
  return { number: pr.number, headSha: pr.head.sha, material: protectedChange, approval };
}
async function commit(api, sha) {
  const row = await api('/git/commits/' + sha);
  demand(row.sha === sha && SHA.test(row.tree?.sha) && Array.isArray(row.parents));
  return row;
}
async function promotionProof(api, pr) {
  identity(pr);
  demand(pr.base.ref === 'staging' && pr.head.ref === 'dev');
  const compare = await api('/compare/' + pr.base.sha + '...' + pr.head.sha);
  demand(compare.status === 'ahead' && compare.merge_base_commit?.sha === pr.base.sha);
  const base = await commit(api, pr.base.sha),
    sources = [];
  let cursor = pr.head.sha;
  for (let n = 0; n < 64; n++) {
    if (cursor === pr.base.sha) return { sources, baseline: false };
    const row = await commit(api, cursor);
    if (cursor === BASELINE.sha && pr.base.sha === BASELINE.parent) {
      demand(row.tree.sha === BASELINE.tree && row.parents.length === 1 && row.parents[0].sha === BASELINE.parent);
      // Explicit historical source boundary, enrolled by the human-reviewed control
      // bootstrap. Never pretend PR2 had a review or allow another baseline.
      return { sources, baseline: true };
    }
    demand(row.parents.length === 2);
    const associated = await api('/commits/' + cursor + '/pulls?per_page=100', null, true);
    const matches = associated.filter(x => x.merge_commit_sha === cursor && x.base?.ref === 'dev' && x.merged_at && x.state === 'closed');
    demand(matches.length === 1);
    const source = await api('/pulls/' + matches[0].number);
    identity(source);
    demand(
      source.merged === true &&
        source.state === 'closed' &&
        source.merge_commit_sha === cursor &&
        source.base.ref === 'dev' &&
        source.head.sha === row.parents[1].sha,
    );
    const parent = await commit(api, row.parents[0].sha);
    if (source.head.ref === 'staging' && source.head.sha === pr.base.sha && row.tree.sha === base.tree.sha && parent.tree.sha === base.tree.sha) {
      demand((await filesFor(api, source)).length === 0);
      return { sources, baseline: false };
    }
    sources.push(await approvedSource(api, source));
    cursor = row.parents[0].sha;
  }
  throw Error('RESX_PROMOTION_HISTORY_LIMIT_REJECTED');
}
async function evaluate(api, pr) {
  identity(pr);
  demand(pr.state === 'open' && !pr.draft);
  demand((await api('/git/ref/heads/' + pr.base.ref)).object.sha === pr.base.sha);
  if (pr.base.ref === 'staging') {
    demand((await api('/git/ref/heads/dev')).object.sha === pr.head.sha);
    return { destination: 'staging', ...(await promotionProof(api, pr)) };
  }
  demand(pr.base.ref === 'dev');
  const files = await filesFor(api, pr);
  if (!files.length && pr.head.ref === 'staging') {
    demand((await api('/git/ref/heads/staging')).object.sha === pr.head.sha);
    const head = await commit(api, pr.head.sha),
      base = await commit(api, pr.base.sha);
    const compare = await api('/compare/' + pr.base.sha + '...' + pr.head.sha);
    demand(head.tree.sha === base.tree.sha && compare.status === 'ahead' && compare.merge_base_commit?.sha === pr.base.sha);
    return { destination: 'dev', ancestryOnly: true };
  }
  demand(files.length > 0);
  return { destination: 'dev', sources: [await approvedSource(api, pr)] };
}
async function publish({ api, checkApi, pulls }) {
  const groups = new Map();
  for (const pr of pulls) {
    if (!['dev', 'staging'].includes(pr.base.ref)) continue;
    const key = pr.base.ref + ':' + pr.head.sha;
    const list = groups.get(key) || [];
    list.push(pr);
    groups.set(key, list);
  }
  for (const list of groups.values()) {
    const first = list[0],
      results = [];
    const pending = await checkApi('/check-runs', { name: 'RESX risk admission ' + first.base.ref, head_sha: first.head.sha, status: 'in_progress' });
    demand(Number.isSafeInteger(pending.id) && pending.id > 0);
    let success = true;
    for (const pr of list) {
      try {
        results.push(await evaluate(api, await api('/pulls/' + pr.number)));
      } catch {
        success = false;
      }
    }
    const fresh = await api('/pulls?state=open&per_page=100', null, true);
    const tuples = rows =>
      rows
        .filter(p => p.base.ref === first.base.ref && p.head.sha === first.head.sha)
        .map(p => [p.number, p.base.sha, p.head.ref, p.draft])
        .sort((a, b) => a[0] - b[0]);
    if (JSON.stringify(tuples(fresh)) !== JSON.stringify(tuples(list))) success = false;
    const base = (await api('/git/ref/heads/' + first.base.ref)).object.sha;
    if (list.some(p => p.base.sha !== base)) success = false;
    if (first.base.ref === 'staging' && (await api('/git/ref/heads/dev')).object.sha !== first.head.sha) success = false;
    const record = {
      version: 1,
      repositoryId: c.REPOSITORY_ID,
      destination: first.base.ref,
      headSha: first.head.sha,
      pullRequests: tuples(fresh).map(([number, baseSha, headRef, draft]) => ({ number, baseSha, headRef, draft })),
      results,
    };
    const name = 'RESX risk admission ' + first.base.ref,
      conclusion = success ? 'success' : 'failure',
      text = JSON.stringify(record);
    demand(text.length <= 60000);
    await checkApi(
      '/check-runs/' + pending.id,
      {
        name,
        status: 'completed',
        conclusion,
        output: {
          title: success ? 'Trusted risk/provenance qualified' : 'Risk/provenance not qualified',
          summary: 'Native dev review or exact merged-dev promotion proof; no bot review submitted.',
          text,
        },
      },
      'PATCH',
    );
    if (!success) {
      for (const original of list) {
        const current = await api('/pulls/' + original.number);
        if (current.auto_merge && current.head.sha === original.head.sha) await api('/graphql-disable-auto-merge', { nodeId: current.node_id });
      }
    }
  }
}
function bound(checks, pr, pulls) {
  const check = checks
    .filter(x => x.name === 'RESX risk admission ' + pr.base.ref && x.app?.id === 5919556 && x.head_sha === pr.head.sha)
    .sort((a, b) => b.id - a.id)[0];
  demand(
    check?.status === 'completed' && check.conclusion === 'success' && typeof check.output?.text === 'string' && check.output.text.length <= 60000,
  );
  const record = JSON.parse(check.output.text);
  const expected = pulls
    .filter(p => p.head.sha === pr.head.sha && p.base.ref === pr.base.ref)
    .map(p => ({ number: p.number, baseSha: p.base.sha, headRef: p.head.ref, draft: p.draft }))
    .sort((a, b) => a.number - b.number);
  demand(
    record.version === 1 &&
      record.repositoryId === c.REPOSITORY_ID &&
      record.headSha === pr.head.sha &&
      record.destination === pr.base.ref &&
      JSON.stringify(record.pullRequests) === JSON.stringify(expected) &&
      expected.some(p => p.number === pr.number && !p.draft),
  );
  return record;
}
module.exports = { evaluate, promotionProof, approvedSource, material, publish, bound, BASELINE, CSS };
