'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { classify, sourceRoute, eligibility } = require('./resx-cicd.cjs');
const head = 'a'.repeat(40),
  baseSha = 'b'.repeat(40);
function input() {
  return {
    head,
    baseSha,
    approvedWorkflowDigest: 'd'.repeat(64),
    ciEvidence: {
      repositoryId: 795522855,
      sourceSha: head,
      runId: '123',
      runAttempt: 1,
      workflowPath: '.github/workflows/resx-ci.yml',
      workflowBlobSha256: 'd'.repeat(64),
      conclusion: 'success',
      checkRunId: 42,
      event: 'pull_request',
      pullRequestNumber: 7,
      baseSha,
      applicationValidation: 'success',
    },
    protectionsVerified: true,
    pr: {
      number: 7,
      state: 'open',
      draft: false,
      author_association: 'OWNER',
      user: { id: 1 },
      head: { sha: head, ref: 'codex/change', repo: { id: 795522855, full_name: 'nguijoel/ontoo-resx' } },
      base: { sha: baseSha, ref: 'dev', repo: { id: 795522855, full_name: 'nguijoel/ontoo-resx' } },
    },
    files: [{ status: 'modified', filename: 'webapp/src/app/app.component.html' }],
    reviews: [],
    authorizedReviewerIds: [2],
    checks: [{ id: 42, name: 'RESX CI', head_sha: head, conclusion: 'success', app: { id: 15368 } }],
  };
}
test('routine eligible PR and docs-only scope preserve head/base identity', () => {
  assert.equal(eligibility(input()).protected, false);
  const i = input();
  i.files = [{ status: 'modified', filename: 'docs/usage.md' }];
  assert.equal(eligibility(i).documentationOnly, true);
});
test('draft, failed CI, wrong publisher, stale head/base and absent protections reject', () => {
  for (const mutate of [
    i => (i.pr.draft = true),
    i => (i.checks[0].conclusion = 'failure'),
    i => (i.checks[0].app.id = 1),
    i => (i.head = 'c'.repeat(40)),
    i => (i.baseSha = 'c'.repeat(40)),
    i => (i.protectionsVerified = false),
  ]) {
    const i = input();
    mutate(i);
    assert.throws(() => eligibility(i));
  }
});
test('governance needs current exact-head independent human; stale, bot, self and dismissal reject', () => {
  const i = input();
  i.files = [{ status: 'modified', filename: 'docs/governance/GOV-CICD-001.md' }];
  assert.throws(() => eligibility(i), /HUMAN_REVIEW_REQUIRED/);
  const r = { id: 1, state: 'APPROVED', commit_id: head, user: { id: 2, type: 'User' } };
  i.reviews = [r];
  assert.equal(eligibility(i).protected, true);
  assert.equal(eligibility(i).documentationOnly, true);
  for (const change of [{ commit_id: 'c'.repeat(40) }, { user: { id: 1, type: 'User' } }, { user: { id: 2, type: 'Bot' } }]) {
    i.reviews = [{ ...r, ...change }];
    assert.throws(() => eligibility(i));
  }
  i.reviews = [r, { ...r, id: 2, state: 'DISMISSED' }];
  assert.throws(() => eligibility(i));
});
test('all enforcement and unknown paths are protected; renamed control cannot escape old path', () => {
  for (const filename of ['.github/workflows/resx-ci.yml', 'bin/resx-cicd.cjs', 'deploy/resx/Dockerfile', 'api/src/config.ts', 'unknown.txt'])
    assert.equal(classify([{ status: 'modified', filename }]).protected, true);
  assert.equal(classify([{ status: 'renamed', filename: 'docs/usage.md', previous_filename: '.github/workflows/check.yml' }]).protected, true);
  assert.throws(() => classify([{ status: 'renamed', filename: 'docs/a.md' }]));
});
test('secret files, traversal, empty and unknown diff status reject', () => {
  for (const filename of ['api/.env', 'api/prod.env', 'api/PROD.ENV', 'cert/key.pem', '../app.ts', 'api\\src\\x.ts'])
    assert.throws(() => classify([{ status: 'added', filename }]));
  assert.throws(() => classify([]));
  assert.throws(() => classify([{ status: 'unknown', filename: 'README.md' }]));
});
test('staging only accepts protected dev predecessor; main and foreign repos reject', () => {
  const i = input();
  i.pr.base.ref = 'staging';
  assert.throws(() => sourceRoute(i.pr));
  i.pr.head.ref = 'dev';
  assert.equal(sourceRoute(i.pr), 'staging');
  i.pr.base.ref = 'main';
  assert.throws(() => sourceRoute(i.pr));
  i.pr.base.ref = 'dev';
  i.pr.head.repo.id = 1;
  assert.throws(() => sourceRoute(i.pr));
});

test('CI name/app alone cannot replace independently resolved workflow provenance', () => {
  for (const change of [
    i => delete i.ciEvidence,
    i => (i.ciEvidence.sourceSha = baseSha),
    i => (i.ciEvidence.workflowBlobSha256 = 'e'.repeat(64)),
    i => (i.ciEvidence.workflowPath = '.github/workflows/fake.yml'),
    i => (i.ciEvidence.checkRunId = 99),
  ]) {
    const i = input();
    change(i);
    assert.throws(() => eligibility(i), /UNTRUSTED_CI_PROVENANCE|CI_NOT_SUCCESSFUL/);
  }
});
test('zero-diff ancestry sync requires exact protected refs/full trees and prior promotion proof', () => {
  const i = input();
  i.files = [];
  assert.throws(() => eligibility(i));
  i.pr.head.ref = 'staging';
  i.synchronization = {
    currentDevSha: baseSha,
    currentStagingSha: head,
    devTree: 'f'.repeat(40),
    stagingTree: 'f'.repeat(40),
    currentDevIsAncestor: true,
    priorPromotionVerified: true,
  };
  assert.equal(eligibility(i).ancestryOnly, true);
  i.synchronization.stagingTree = 'c'.repeat(40);
  assert.throws(() => eligibility(i));
});

test('same baseline supports a separately enrolled repository and rejects cross-profile identities', () => {
  const common = require('./ontoo-cicd.cjs');
  const alternate = common.createControls({
    repository: 'example/second-app',
    repositoryId: 999999,
    integrationBranch: 'integration',
    promotionBranch: 'staging',
    ciWorkflow: '.github/workflows/ci.yml',
    ciCheck: 'Second CI',
    ciAppId: 15368,
    routineRoots: ['src'],
  });
  const i = input();
  assert.throws(() => alternate.sourceRoute(i.pr));
  i.pr.base.repo = { id: 999999, full_name: 'example/second-app' };
  i.pr.head.repo = { id: 999999, full_name: 'example/second-app' };
  i.pr.base.ref = 'integration';
  assert.equal(alternate.sourceRoute(i.pr), 'integration');
  assert.equal(alternate.classify([{ status: 'modified', filename: 'src/ui.ts' }]).protected, false);
  assert.equal(alternate.classify([{ status: 'modified', filename: '.github/workflows/ci.yml' }]).protected, true);
});

test('WIP push or wrong PR/base cannot substitute a full PR validation run', () => {
  for (const change of [
    i => (i.ciEvidence.event = 'push'),
    i => (i.ciEvidence.pullRequestNumber = 8),
    i => (i.ciEvidence.baseSha = head),
    i => (i.ciEvidence.applicationValidation = 'skipped'),
  ]) {
    const i = input();
    change(i);
    assert.throws(() => eligibility(i), /CI_EVENT_NOT_BOUND_TO_PR|INCOMPLETE_APPLICATION_VALIDATION/);
  }
});

test('documentation build-skip requires repository enrollment, never a universal docs exemption', () => {
  const c = require('./ontoo-cicd.cjs').createControls({
    repository: 'example/docs-runtime',
    repositoryId: 999998,
    integrationBranch: 'dev',
    promotionBranch: 'staging',
    ciWorkflow: '.github/workflows/ci.yml',
    ciCheck: 'CI',
    ciAppId: 15368,
    routineRoots: ['src'],
  });
  const result = c.classify([{ status: 'modified', filename: 'docs/page.md' }]);
  assert.equal(result.documentationOnly, false);
  assert.equal(result.protected, true);
});
