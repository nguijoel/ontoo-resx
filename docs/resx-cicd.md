# ONTOO Git-to-PRE baseline: RESX first enrollment

The CI/promotion/admission/rollback standard applies across ONTOO repositories.
This first enrollment is nguijoel/ontoo-resx, repository795522855, dev -> staging -> PRE.
Common controls are profile-driven; enrolling another repository is explicit,
not permission to reuse RESX identities, runtime targets or credentials.
Main/PROD excluded. PR6 is closed unmerged; preserve its real application change
for a fresh PR once the permanent process is ready. No separate product/demo
change. CI/CD-001 supersedes the POC framing; the end-to-end acceptance cases remain.

## Implemented source, not live enforcement

- resx-fast.yml: source-only WIP feedback, never emits full validation eligibility.
- resx-ci.yml: read-only source/range tests; locked Linux dependency install;
  profile/TLS tests, API unit/build, preview SPA build. Verified prose-only changes
  skip app work. Aggregate required check: RESX CI.
- resx-reconcile.yml: trusted dev checkout only, no PR execution/install;
  native auto-merge plus a validated dev-to-staging PR plan. A qualified App
  creator is mandatory; ordinary GITHUB_TOKEN PR creation/dispatch is not used
  as a substitute for merge-eligible PR validation.
- resx-release.yml: staging-only allowlisted Git export, pinned image build,
  no-network native-module smoke, GHCR image plus separate receipt, constrained
  OIDC request. Missing enrollment fails; HTTP202 is ACCEPTED, not deployed.

The resx-cicd adapter is NOT independent policy authority. Use a protected
installed revision, never candidate code, for eligibility publication. The
proposed dedicated App publishes ONTOO policy eligibility dev and ONTOO policy
eligibility staging, binding every relevant PR/head/base/destination under current
trusted policy. A PR-authored same-name workflow is not a substitute.

App proposal: Checks write; Contents/PR/Actions/Metadata read; selected repository
only. No Admin/packages/ref/merge write. Owner approved the exact selected-repo App, isolated evaluator and fixed
OIDC/local-controller security scope on25November; registration, reviewed code
and actual service activation remain separate. App registration/selected-repository
installation are complete as recorded below. No broader access is implied.
Branch protection must bind strict RESX CI to Actions App15368 and the applicable
policy context to the actual independent AppID; require PR/conversation resolution,
enforce admins and reject force/delete. No placeholder ID or caller rule boolean.

## Runtime and recovery

Reuse existing controller/global lock/journal. Live966ee0a0 is first-install-only;
never replay it for update. Infra is implementing bounded single-active replacement
with retained predecessor image/config and compensating rollback, same exact
runtime/IP/port. This allows a bounded PRE availability gap, not zero downtime.
No database restore/migration is part of app rollback. PR6 AWS config is separate
from old no-AWS rollback config; preserve signing secret privately. Safe smoke:
GET health/runtime-info/login, never POST login/push. Outbound enablement still
needs exact independently reviewed scope evidence. No secrets in CI/evidence.

## Acceptance ledger, 25 November 2026

| Required case | Current evidence | Operational proof |
| --- | --- | --- |
| CI and eligible auto-merge | Local adapter/orchestration tests | Pending |
| Draft/failed/noncompliant rejection | Negative unit tests | Pending |
| Governance human approval | Exact-head/self/stale/dismissal tests | Publisher pending |
| Automatic staging promotion | PR/once-only-dispatch tests | Pending |
| Automated PRE deployment | Workflow source | Enrollment/controller pending |
| Subsequent deployment | Infra synthetic state-machine tests reported | Pending |
| Rollback/recovery | Retained compatible predecessor contract | Pending |
| Invalid/unauthorized request | Infra synthetic OIDC tests reported | Real verifier/receiver pending |

Deploy ran22 Node control/orchestration tests +2 Python pattern tests successfully,
including a synthetic second repository and cross-profile identity rejection.
Workflow YAML parsed with js-yaml. The exporter reproduced the known deployed
2d749 source archive byte-for-byte:328files/1955840tarbytes/SHA256
e4a3f3126d5cd902960c8e95f63710561f1727868c7ff05d8afe2b82f8e26c04.
Local source tests are not release acceptance.
Add actual GitHub run/PR/check IDs, installed digests, terminal protected receipts,
artifact/source/config/schema bindings and public health before claiming completion.

Baseline integration: dev edbf651 lacks deployed2d749 in draftPR5 (overlapping
predecessorPR3). Reconcile reviewed source without duplicate merges; do not use
pending feature as reason to skip controls. Keep DBsourcePR4 and WIP separate.

## Native GitHub checkpoint

At source d1795a3fd5b768b588c2a310d4149473b6cbcbdf, PR run
https://github.com/nguijoel/ontoo-resx/actions/runs/45546711563 and push run
https://github.com/nguijoel/ontoo-resx/actions/runs/45546711386 completed success.
This proves CI for that exact checkpoint, not later heads or PRE delivery.
Native dev/staging rules now require strict RESX CI bound to Actions App15368;
PR/admin/conversation rules and no-force/no-delete remain. Independent eligibility
contexts are not enrolled yet. Default Actions token is read-only. GitHub's
combined create/approve-PR toggle is false. A qualified separate App creates
promotion PRs; the workflow token never approves reviews. Independent policy
rejects bot approvals. No toggle restoration is needed for that creation route.
No automatic merge/deployment is activated by these partial settings.

At subsequent source12582c48454a86a16c9346a914896b1ce7f8e4a2, full PR run
https://github.com/nguijoel/ontoo-resx/actions/runs/45547844398 and separate fast
feedback45547831859 also completed success. Fast feedback does not publish the
merge-eligible RESX CI context. Merge orchestration now additionally requires
a short-lived independently published PR/base/head/open-PR-set binding, with
already-enabled native auto-merge treated as idempotent. Native proof of this
last orchestration guard remains pending independent publisher enrollment.

## Native negative acceptance

PR7 was an unmerged control-test fixture only, never a product candidate:
https://github.com/nguijoel/ontoo-resx/pull/7 at
8da751a219ca54c6b02c7c2da3d0d5a9357174a5. Required RESX CI
check138985732104/run45549073791 failed as intended. Native merge returned
HTTP405, Required status check RESX CI is failing. The same failed fixture was
converted to draft; native merge returned HTTP405, Pull Request is still a draft.
Both attempts left dev edbf651 unchanged. PR7 is closed unmerged; branch and
evidence are retained. The draft case also had the known failing CI fixture;
this does not claim an isolated all-green draft test.

## Remaining integration requirements

Current GitHub rules say token-created PR workflows require approval and
workflow_dispatch checks do not satisfy PR-required checks. The prior dispatch
workaround is withdrawn. Reconciliation now rejects absent qualified PR creation
instead of silently creating manual-approval promotions. App creation must use
the separately qualified authoring boundary, not the read-only evaluator.
See https://docs.github.com/en/actions/concepts/security/github_token and
https://docs.github.com/en/enterprise-cloud@latest/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks .

A source-level auto-merge guard re-fetches the full relevant PR set and disarms
an existing auto-merge if its bound decision is invalid. Native GitHub does not
interpret decision expiry. A protected publisher invalidation/expiry watchdog
and actual already-armed stale-decision test remain required before acceptance.
No claim is made that a pre-enable check alone eliminates that lifecycle risk.

As of this checkpoint, App registration awaits human GitHub account confirmation;
independent review identity and narrow archive/availability policy disposition
also remain unresolved. The only current human collaborator is nguijoel, also
PR6 author. No self-approval, agent ACK or unqualified bot review is substituted.

The qualified PR-creation adapter is currently NOT wired. Missing adapter fails
closed rather than creating a token-authored PR whose checks require manual
approval. Workflow dispatch remains integration/release orchestration only,
never PR-check evidence. Publisher expiry invalidation and native stale-armed
merge acceptance remain unfinished; the five-minute reconciliation schedule
is a recovery aid, not a replacement for a working protected watchdog.

Linux image qualification is now part of the required CI aggregate for app
changes: immutable context, pinned Linux base, isolated native-module smoke and
actual docker-save format metadata. The earlier green CI checkpoints predate
this stronger image gate; they do not claim image-gate success. Prose-only work
skips both application and image jobs only under the enrolled source classifier.

On 25 November, exact source `637e86bf7485e6413d068968dd9aa71fd7aae3ee`
passed [hosted validation run 45552017483](https://github.com/nguijoel/ontoo-resx/actions/runs/45552017483):
source controls, application tests/build, Linux image qualification and the required
aggregate all succeeded. Fast-feedback run 45552008543 also succeeded. The image
job reported an actual hybrid Docker export: `manifestBased=true`, `ociIndex=true`,
395703296 archive bytes and 25 entries. The protected receiver must qualify this
format; successful image CI alone is not archive-parser or PRE acceptance. This
job did not publish an artifact or deploy an application. The local 75-second
notification deadline adjustment is subsequent source work, not covered by that run.

## CI/CD-001 current direction

Owner priority is P1. PR6 was closed unmerged at `637e86b`; preserve its source
branch/history and create a fresh application PR only when the process is ready.
Do not reopen PR6 or create a separate POC product change. Defer redundant broad
testing; retain required CI and targeted authorization, release and rollback checks.

The approved ONTOO Release Evaluator App was created as App ID `5919556` and
installed as installation `185732896`, with selected access only to repository
`795522855` (`nguijoel/ontoo-resx`). GitHub UI readback confirmed Checks write and
Actions/Contents/Pull requests/Metadata read. No private key was generated or
provisioned by that operation; service activation and actual identity qualification
remain unfinished engineering. Account authentication is no longer a blocker.

GHCR remains the standard distribution mechanism. The local release workflow
now proposes staging-only `packages:write`, isolated runner Docker credentials,
a fixed `ghcr.io/nguijoel/ontoo-resx` repository and immutable digest readback.
Its canonical receipt binds repository/source/run/attempt, registry repository,
registry manifest digest and image config ID; Actions retains that receipt only.
This replaces the earlier archive-distribution proposal. It has not been published,
run, or enrolled at the receiver; protected digest-pull/collector compatibility and
actual package access must be qualified before enabling releases. The historical
archive-parser work remains evidence only and is not the default release path.

The local merge-handoff implementation addresses workflow-token-suppressed push
events: after current-tip merged-PR and required-protection checks, it detects
existing integration/release runs or writes a bot-authored PR-comment reservation
before dispatch. A visible reservation blocks another dispatch after an uncertain
dispatch response. An ambiguous comment-creation response can cause a later
metadata retry when no reservation is visible; it is not exactly-once authority.
The locked root controller must deduplicate an already-current, independently
verified healthy source/config/physical-target binding even across different run
or image IDs, and preserve in-flight/UNKNOWN barriers. Drift must never be reported
as a successful no-op; historical source/config is not permanently banned because
authorized rollback must remain possible.
Both consumers bind the dispatch snapshot via `expected_sha`; the receiver must
also recheck live protected refs before mutation. Staging dispatch still
requires independently enrolled actor/control/promotion admission at the receiver.
Dispatch CI never counts as PR-required validation. Exact GitHub Actions bot
identity was read from the public API as `github-actions[bot]`, ID `41898282`;
the protected automation-ID variable and receiver dispatch actor must be enrolled
explicitly. No variable/enrollment/host operation was performed by this source
change. Native merge handoff/recovery remains unqualified; unresolved reservations
need evidence-based reconciliation. A failed/cancelled prior run is preserved,
not silently rerun. Qualified PR creation is still a separate required adapter.

The operator's downloaded evaluator PEM is only a temporary one-time import
source. Infrastructure reports the owner-approved authoritative store was created
once at `/ontoo-infrastructure/hosting/pre/release-evaluator/github-app-private-key`,
account284106887285/eu-west-2, Standard SecureString using `alias/aws/ssm`, version1.
Its captured internal readback matched; no IAM grant or overwrite occurred.
Provisioning/rotation/recovery use the existing Infrastructure operator. No new
unattended HOST003 AWS identity or static AWS access key is introduced.
`/etc/ontoo/release-evaluator/github-app.pem`, if retained, is
protected runtime custody (root:evaluator0440 under0750), not the authoritative
store. The trusted service consumes its approved runtime credential; releases must not
depend on the operator's laptop, Downloads directory or a local selection file.
Neither the repository, application image nor candidate Actions jobs receive the
key. After verified import and actual App/installation qualification, reconcile
the failed-download key, retain only the approved credential/recovery custody,
and dispose of the temporary download through the governed cleanup operation.
Rotation/revocation and recovery must preserve service identity and audit history;
the local transfer failure is an implementation defect, not the permanent design.
The attempted local consumer rejected inconsistent Windows ctime metadata before
its first key-content read, according to Infrastructure's diagnosis; no import was
performed by that attempt. Infrastructure subsequently reports successful
SSM-version-bound runtime import, receipt SHA256
`352b14b4aafd7c51d57da31a9f659170fa2f96615d18deac7b9e2ef25400b725`,
and corrected once-only App qualification run02, protected receipt SHA256
`92dd5684e11e2f7da62ed76d8989812327dd04064a7e1053d6740dc5fa4442ae`.
Qualification proved App5919556/install185732896 and a token narrowed to RESX795522855
with Checks write and Actions/Contents/Pull requests/Metadata read. No secret or
token value was recorded. The original failed qualification is preserved; its
pre-network token-expiry sample required a narrow issuance-budget correction.
The final installed service closure must include that corrected identity code.
All five release services remain inactive. Do not repeat the accepted store,
import or qualification, or resume the failed filesystem transfer. This is actual
identity/custody evidence, not automated promotion or live deployment acceptance.

Infrastructure reports the complete inactive install succeeded once, protected
receipt SHA256 `669954a676fb10cba208b877a2be651b513291de14e569a1ddacad26b69058f6`.
Independent host readback matched24 public code files, six units and the nonlive
Caddy snippet; the disabled enrollment separates15 loaded modules from24 installed
inventory entries. The corrected identity code is now installed. Ingress identity
is UID994/GID984, evaluator UID995/GID985; key metadata is unchanged. All five
services are inactive; no daemon reload, profile/route/registry activation or live
controller replacement occurred. Native runtime/endpoint qualification remains.

The local PR-authoring client now implements the agreed fixed HTTPS/OIDC protocol
at `/.well-known/ontoo-release/resx-authoring`, audience `ontoo-resx-authoring`.
It permits only dev→staging and staging→dev requests, binds freshly read head/base
SHAs and a stable semantic request ID, and accepts only the exact broker success
schema. Tokens are request headers only; response sizes and deadlines are bounded.
Unknown/rejected/network outcomes are not retried automatically under a new ID.
The request ID and source refs are safe reconciliation evidence; titles/bodies and
tokens are not logged. `RESX_AUTHORING_ENROLLED` remains unset; the actual broker
route and separate App5891355 enrollment are not live. The trusted reconcile job's
hosting-pre/OIDC capability is source only. Eighteen focused local orchestration/
protocol tests passed; no live broker request, PR creation or native acceptance is
claimed. Independent receiver enrollment, App scope and human governance review
remain required; this client never obtains the PR-authoring App key/token.
