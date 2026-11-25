# ONTOO Git-to-PRE baseline: RESX first enrollment

The CI/promotion/admission/rollback standard applies across ONTOO repositories.
This first enrollment is nguijoel/ontoo-resx, repository795522855, dev -> staging -> PRE.
Common controls are profile-driven; enrolling another repository is explicit,
not permission to reuse RESX identities, runtime targets or credentials.
Main/PROD excluded. Existing PR6 is the application candidate; no separate
product/demo change. CI/CD-POC-001 remains the acceptance contract.

## Implemented source, not live enforcement

- resx-ci.yml: read-only source/range tests; locked Linux dependency install;
  profile/TLS tests, API unit/build, preview SPA build. Verified prose-only changes
  skip app work. Aggregate required check: RESX CI.
- resx-reconcile.yml: trusted dev checkout only, no PR execution/install;
  native auto-merge plus validated dev-to-staging PR. Explicit dispatch for a
  new token-created promotion; existing promotions do not recursively dispatch.
- resx-release.yml: staging-only allowlisted Git export, pinned image build,
  no-network native-module smoke, image archive plus separate receipt, constrained
  OIDC request. Missing enrollment fails; HTTP202 is ACCEPTED, not deployed.

The resx-cicd adapter is NOT independent policy authority. Use a protected
installed revision, never candidate code, for eligibility publication. The
proposed dedicated App publishes ONTOO policy eligibility dev and ONTOO policy
eligibility staging, binding every relevant PR/head/base/destination under current
trusted policy. A PR-authored same-name workflow is not a substitute.

App proposal: Checks write; Contents/PR/Actions/Metadata read; selected repository
only. No Admin/packages/ref/merge write. Owner approved the exact selected-repo App, isolated evaluator and fixed
OIDC/local-controller security scope on25November; registration, reviewed code
and actual enrollment readback remain pending. No broader access is implied.
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

Deploy ran15 Node control/orchestration tests +2 Python pattern tests successfully,
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
