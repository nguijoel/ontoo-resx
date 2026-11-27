# ONTOO native CI/CD - RESX first enrollment

Status: implementation and enrollment in progress; no live acceptance claimed.
Updated 25 November 2026. PROD is excluded. The latest owner instruction requires
first automated deployment, repeat deployment and explicit rollback/recovery as
one deliverable; it supersedes the earlier deferral of those proofs.

## Native delivery and trust boundary

- A successful WIP push on codex/** automatically opens an App-authored PR through
  the trusted dev workflow. No human PR-creation or workflow trigger is needed.
  WIP feedback never substitutes for full normal pull_request CI.
- RESX CI (Actions App15368) validates source, application and Linux image inputs.
  Native branch protections require it, enforce admins/conversations and reject
  force pushes/deletion. MERGE-only is now configured; squash/rebase are disabled
  so merged source, parents and approval provenance remain unambiguous.
- The trusted dev Actions job publishes risk checks using a separately scoped
  existing RESX-only Checks-write App with approved protected Actions key custody.
  This is a native job, not an evaluator/publisher/watchdog service. Binding the
  required context to its specific App prevents candidate Actions code from
  forging a same-name success through shared Actions App15368.
- Dev material/unknown paths retain native code-owner human review. Routine paths
  are explicitly delegated, never inferred from a label or caller boolean. The
  initial routine app envelope is search.component.css: the search-icon font size
  1.25rem or 1.375rem, optionally line-height:1. README/CHANGELOG modifications are
  prose exceptions. Added/removed/renamed delegated files or CSS outside this
  envelope fail closed; change the owned policy first. All other source remains
  material until a governed classification change explicitly delegates it.
- Staging accepts only the current dev tip. Its required signed check walks exact
  native merged dev PR parents, classifies complete diffs and verifies authorised
  independent human reviews of each material source head. The review ID, reviewer
  ID and commit SHA are retained in the machine record. Routine source needs no
  human approval. This carries dev approval forward without a second human review
  or a fake bot review. Unknown provenance is rejected.
- The initial historical source boundary is explicitly edbf651e8c7fdb6b51f5e8635b4f681f0ce25f82,
  tree d3d6602900bd5f72a7d24dc753a47ac2252de63e, parent/staging
  ed287c2c10ca9c14a151c862a891de968334d210. It is enrolled by the normal human-reviewed
  control bootstrap; the implementation never claims historical PR2 had a review.
- Auto-merge requires CI, the signed exact-head/base/PR-set risk binding and fresh
  live evidence. Review-event reconciliation marks risk admission pending before
  reads, patches its conclusion and disarms invalid merges. API/evidence failure
  leaves non-success. GitHub review events are asynchronous: this is an observed
  admission snapshot, not a claim of instantaneous distributed revocation.
- Successful current dev CI automatically creates the dev-to-staging PR. Exact-tree
  ancestry sync prevents repeated merge cycles from drifting; it is itself proven
  to change no content. Explicit dispatch recovery bridges GITHUB_TOKEN-suppressed
  push events without treating dispatch as PR approval. Failed/unknown attempts
  are preserved rather than blindly retried.

## Enrollment and risk-based native rules

Actual GitHub readback: both dev and staging currently require one human review,
code-owner review and stale dismissal, with strict RESX CI/App15368 and all other
protections retained. This conservative enrollment state remains until the
reviewed controls and isolated signed check are installed and qualified.

Final dev rules: global approval count0, native code-owner review ON, stale
approval dismissal ON, strict required RESX CI/App15368 and
RESX risk admission dev/App5919556, existing admin/conversation/no-force/no-delete
controls unchanged. CODEOWNERS fallback owns unknown/material paths; only the
explicit routine leaves above are ownerless.

Final staging rules: global approval count0, no repeated native code-owner review,
strict RESX CI/App15368 and RESX risk admission staging/App5919556. The latter
requires exact already-approved dev provenance. This replaces a duplicate manual
review with a mandatory nonforgeable check; no actor bypass is granted. Do not
apply these final rules before the signed issuer/proof is operational.

## Credentials and actual enrollment evidence

- ontoo-development App5891355/install185090623 now selects exactly RESX795522855
  plus its five pre-existing repositories. Infrastructure verified the actual
  addition; Contents read/Metadata read/PR write permissions were preserved.
- resx-ci-authoring environment28557619890 is configured for selected dev BRANCH
  only, no tags or routine environment approval. The existing App key is destined
  for ONTOO_DEVELOPMENT_APP_PRIVATE_KEY. Automatic approval review blocked the
  precise key export before execution; Infrastructure has requested explicit
  destination authorisation. No overwrite/retry or proxy export is permitted.
- The official create-github-app-token action is pinned to v3.2.0 commit
  bcd2ba49218906704ab6c1aa796996da409d3eb1. The authoring token names ONLY ontoo-resx,
  Contents read/PR write; the risk token is ONLY Checks write/Metadata read for
  that repository. Tokens are short-lived and revoked by post-job actions. Public
  installation/scope IDs are audited; keys/tokens are never logged.
- Existing repo-only App5919556 protected-job custody was approved and provisioned
  from its existing SSM version1 into dev-only resx-ci-authoring, secret
  ONTOO_RESX_RISK_APP_PRIVATE_KEY. Native job use still needs qualification.
  This adds no App, permission, repository or service. The existing standalone service files remain inactive/excluded.
- Neither trusted job executes candidate code or installs candidate packages.
  Branch-only environment restrictions plus owned workflow/helper files protect
  secret access; GitHub environments do not allowlist individual workflow files.

## GHCR and existing-controller integration

The staging build publishes ghcr.io/nguijoel/ontoo-resx and binds the seven-field
receipt: repositoryId, sourceSha, runId, runAttempt, registryRepository,
registryManifestDigest and imageId. The canonical JSON SHA256 is releaseId.
A tag alone is never admission evidence; manifest/index digest and image config ID
are distinct and must be verified for linux/amd64.

The immutable export also computes the App-reviewed database consumer closure:
all regular api/src/** blobs plus API/root package and lock, API tsconfig, protected
runtime/profile files and Docker/build-input definitions. Sorted path/byte hashes
and exact selection rules define its fingerprint; source SHA is bound separately,
independently of frontend changes. Image label
com.ontoo.resx.db-closure-sha256 carries it. Frozen runtime qualification checks
mysql2 3.14.0 and TypeORM0.3.28, not semver declarations alone.

Actual source71a76cd closure97ce6c28239cbb03519c3c467e37d7556a1f8ee9487595df895749a9b110f791
covers116 files, selection3738996d9eddeb7e47570aef0b12ad187cbcce809093cd155ebf71e286d0c885.
This is not a schema digest or release approval. The owner narrowed the first
release to application deployment only (25 November, Infra owner turns
01a214ae-4a78, 01a214b0-357c and 01a214b1-2aea). Fresh database/schema/session
queries, descriptor comparison and DBA baseline enrollment are excluded from
this app release admission. Preserve earlier evidence without continuing those
diagnostics or treating them as deployment blockers. The existing DB connection,
permissions and no-AWS configuration remain paired with the app. Startup
automigration and seeding remain false. Known pre-existing limits remain explicit: label.color
native7 versus entity8 only certifies values fitting7; translation.value native
mediumtext is not permission to shrink/migrate it to entity text. No automatic
DDL, migrations, seeding, repair or data rollback is permitted.

The owner approved a dedicated restricted RESX-PRE SSH identity and Infrastructure
custody. Fresh host readback found no existing unattended transport. The source
client uses ontoo-resx-pre-deploy@185.189.0.51, pinned Ed25519 fingerprint
SHA256:5kusMUREWU3SqjdhScMHqnokrqvi4WcLJ5tDCy2cHcI, no remote command, no passwords,
agent/PTY/forwarding/general shell/Docker group or retries. A forced no-argument
receiver selects only the fixed root RESX/PRE profile. Infrastructure provisions
ONTOO_RESX_PRE_DEPLOY_SSH_KEY in staging-only hosting-pre; no private value is
passed to the app, Git, artifacts or SSH child environment. Temporary key files
are private and removed in finally.

Deploy input is exactly action+the seven-field receipt. Rollback input selects only a retained releaseId, with the exact current
sourceSha/runId/runAttempt job provenance (no image/config/path override); the workflow restricts explicit rollback to authorised
owner6606980. Root binds current/predecessor identity, allowed immutable image,
source, existing config/runtime pair, budget, global lock, source/config idempotency,
application health, retained recovery and durable audit before mutation. This
app-only admission does not query or enroll the database. It independently
checks current protected source. The client requires an exact healthy terminal
result and root receiptSha256, and retains only public request/sanitized result.
A compensation ROLLED_BACK is deployment failure, not success. Explicit successful
rollback reports action rollback/outcome UPDATED. Unknown outcomes are not retried. Only an authenticated, strictly typed BUSY
receipt proving no operation was reserved/pulled/mutated permits up to20 waits
of15 seconds on the identical request. SSH/network timeout and every other
negative outcome remain nonretry. The client SSH bound is900 seconds, server
owned bound at most840 seconds, and native job25 minutes; waiting before stop
is separate from the planned single-active outage budget.

Current shared controller is Media-qualified622cfcda1d6239515f31742e1ae4dd744e30f6eb90d29d034e625c5dbc010030;
the separately installed native adapter reuses its validation/admission boundary.
Do not overwrite it with the historical first-install controller. No PRE enrollment flag may be
activated until the SSH, controller and all release bindings are qualified.

The standing maximum300-second single-active PRE interruption/retained-recovery
exception was approved by the owner in Deploy turn01a214cb-4960 and recorded by
Infrastructure in the exact transition authorization ffc4a50b. The300-second limit is the planned
transition budget, not a promise of recovery during host/daemon failure: UNKNOWN
stops further mutation and can require protected recovery. The no-AWS profile/TR_SECRET stay paired
with the predecessor; optional S3 enablement is a later protected config release.
Smoke is GET-only, never POST login/push. Legacy2d749 has no runtime-info endpoint.

## Acceptance state

As of 27 November 2026, the first automated healthy PRE release is **not
confirmed**. PR creation, required CI, protected native merge, inherited material
approval during dev-to-staging promotion, image qualification and GHCR publishing
have actual successful evidence. They do not establish successful deployment.
Repeat deployment and explicit rollback/recovery remain unproven. The owner has
now instructed completion of all live proof stages in that order; the earlier
proof deferral is superseded.

The removed custom authoring broker, evaluator/publisher/watchdog services,
Docker evaluator, archive/collector framework, HTTP/OIDC ingress and queue remain
excluded. Preserve their inactive files/keys/evidence; do not start them or infer
key revocation/deletion. Native Actions orchestrates; the existing controller
retains the necessary deployment safety boundary.

## Bootstrap PR and repeat-cycle reconciliation

Normal App-authored [PR8](https://github.com/nguijoel/ontoo-resx/pull/8)
replaces closed PR6 without discarding its feature ancestry. Initial head3faec860
passed required pull-request validation run45692919326; that evidence does not
cover later descendants. PR8 subsequently merged through normal protections at
30614fa after owner review6065781906. Later control changes retain normal
exact-head required checks and authorised material review.

Reconciliation recovers successful current-tip CI after enrollment without a
manual workflow trigger. Equal-tree staging ancestry sync requires the exact
merged promotion and second parent; an already-synced dev tip is a no-op.
CI reuses application validation only for proven no-content ancestry changes.
The repeat-cycle increment passed53 focused Node control tests and workflow
YAML parsing, with independent bounded source review. These are source checks,
not live promotion, deployment or rollback acceptance.


Delivery order: first automatic healthy PRE application release, then repeat
deployment proof, then rollback proof. Later demonstrations are not prerequisites
to the first release; essential retained recovery and release protections remain.


Ready-PR API integration: after exact required CI/risk, source/base, review and
inventory validation, the trusted Actions job uses GitHub's normal merge endpoint
with the selected head SHA and MERGE method. Like `gh pr merge --auto`, a ready
PR merges immediately; it is not submitted to deferred auto-merge enrollment.
CLEAN and optional-check UNSTABLE states are eligible only with all required
proofs; BLOCKED/BEHIND/DIRTY/unknown states remain rejected. Native protections
are enforced, without admin/force bypass. An already-armed PR remains native.
GitHub CLI implementation reference:
https://github.com/cli/cli/blob/trunk/pkg/cmd/pr/merge/merge.go


## P1 network incident and approved resolution - 27 November

PR12 was approved at exact head2dec3de by review6079861122 and merged natively
into dev6466bf3. Automatic promotion PR14 carried that approval without a second
human review and merged staging94be473. Required source/application/image CI and
immutable GHCR publishing passed.

Release [45891357594](https://github.com/nguijoel/ontoo-resx/actions/runs/45891357594)
failed during SSH exchange on 26 November at20:32:54 UTC. The retained request is
60b920a3e900f94fd6061260adb9876dc4018a4e3d7cb8a2831a54336c1d3325. No root response
was decoded; the result remains UNKNOWN, with no deployment retry. SAHEL's fresh
read-only reconciliation found no matching operation or pending barrier, while
the prior app remained healthy. This is not a claim that every possible remote
side effect can be disproved from absent records.

SAHEL found inbound port22 restricted to one source, with the enrolled receiver,
key and administrative controls intact. Credential-free GitHub-runner probe
[45914825503](https://github.com/nguijoel/ontoo-resx/actions/runs/45914825503), source
80242a6, independently failed at TCP connect to port22 with no authentication or
receiver call. This proves the current runner path is unavailable; the historical
failure's timeout classification remains an evidence-supported inference.

The owner's primary Manager instruction01a21a55-3b36 approved a dedicated,
key-only restricted deployment endpoint while preserving administrative SSH
firewall restrictions. It requires the existing forced receiver, protected
GitHub credentials, pinned host verification, rate limiting and audit logging;
no interactive shell, password, forwarding, root login or unrestricted Docker.
No OIDC, WireGuard, fixed-egress infrastructure or further POC is required.

SAHEL owns host/socket lifecycle, firewall/rate limits, effective-policy checks,
administrative recovery and native retained-target rollback wiring. Deploy owns
the protected GitHub client, fixed endpoint/pin, release evidence and coordinated
live proof. Port2222 was selected only after SAHEL's fresh unused-port check.
The client and public probe are being bound to that fixed port; it is not yet a
qualified live listener. Port22's management allowlist must stay unchanged.

PR13 carries the immediate confirmed-merge handoff fix and safe transport
diagnostics. It remains subject to exact-head CI and material governance review;
it is not an architecture approval or proof that PRE has deployed. The diagnostic
workflow has no environment, secrets, checkout, authentication or receiver access.
It emits only bounded public connectivity/pin results. The release client retains
only native exit status, allowed signal and a closed error category, never raw
SSH stderr, key contents or private paths. Unknown or signalled exchanges do not
become automatic retry authority.

Before the first live release, independently qualify the installed endpoint and
pin, preserving current/config/source bindings, retained recovery and unresolved-
operation guards. Finish the native app-only retained-target rollback path before
its explicit proof; parser presence alone is not implementation. No SQL, migration,
database restore, S3 push or production operation is part of this work. Record first healthy PRE,
subsequent update and rollback/recovery receipts separately; do not count an old
healthy homepage or a completed image build as deployment acceptance.
