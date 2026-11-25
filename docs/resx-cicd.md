# ONTOO GitHub-native CI/CD — RESX first enrollment

Status: source integration in progress; not activated. Updated 25 November 2026.
The owner's simplified GOV-CICD-001 approval supersedes the earlier custom-service
architecture. This is a reusable baseline with repository-specific review,
configuration and deployment bindings. PROD is excluded.

## Selected pipeline

1. Native pull-request Actions validate source, application and Linux image inputs.
   `RESX CI` is the required aggregate check, bound to GitHub Actions App15368.
2. Native protected branches enforce checks, conversations, stale-review dismissal,
   code-owner review, admin enforcement and no force pushes/deletions. Native
   auto-merge waits for these protections; automation never submits an approval.
3. A trusted dev-only job uses the existing `ontoo-development` App5891355 to
   create a dev-to-staging promotion PR after the exact current dev CI succeeds.
   It checks selected head/base SHAs again before posting and verifies the returned
   PR. Normal pull_request CI runs on the App-authored PR.
4. The staging workflow builds and publishes to `ghcr.io/nguijoel/ontoo-resx`.
   Release identity binds repository/source/run/attempt, immutable registry manifest
   digest and image configuration ID. Tags alone cannot authorize deployment.
5. A narrowly authenticated connection invokes the existing Contabo controller.
   The controller retains physical-target/configuration/DB compatibility checks,
   global host locking, source/config semantic idempotency, health checks, retained
   compatible rollback and durable audit receipts. This connection is not yet
   integrated. The old HTTPS/OIDC request has been removed. The deployment job deliberately
   fails closed until the controller transport is integrated; publication alone
   cannot report a deployed release.

Native branch merge commits are preserved. The existing exact-tree ancestry-sync
PR path prevents repeated promotion cycles from becoming an unexplained divergent
branch write. Hosted ancestry-only PR behavior remains unverified. Dispatch
recovery bridges token-suppressed merge events; dispatch is scheduling, never PR
approval or deployment authorization. Failed or uncertain executions require
reconciliation rather than an automatic retry.

## Credential and review boundary

Infrastructure provisions `ONTOO_DEVELOPMENT_APP_PRIVATE_KEY` only in the
`resx-ci-authoring` environment, restricted to selected branch `dev` (not every
protected branch). Verify actual installation185090623 membership/permissions
before setting `RESX_AUTHORING_ENROLLED=true`. Fresh read-only GitHub installation metadata requests returned HTTP403 on
25 November; this proves insufficient metadata access, not absent membership.
Historical installation records do not include RESX795522855; adding that repository requires explicit approval if
fresh verification confirms it is absent. No repository or permission expansion
has been performed by this increment.

The pinned official create-github-app-token action requests only ontoo-resx,
Contents read and Pull requests write; tokens expire within one hour and the
post-job action revokes them. Public App/installation/repository IDs and permission
intent are recorded in the job summary. Never log the key/token. The App key
itself can access the App's installation scope; token narrowing does not narrow
that key. The trusted job checks out dev only and never installs dependencies or
executes PR code. Protect its workflow, helper scripts and CODEOWNERS themselves.
Environment secrets do not natively allowlist individual workflow files: selected
branch restrictions plus required review of all workflow/control changes provide
that boundary. Do not provision this secret before those rules are established.

CODEOWNERS starts conservatively: unknown paths, runtime code, configuration,
workflows and governance require @nguijoel review; only ordinary top-level
README/CHANGELOG prose is checks-only. This still allows native auto-merge after
required review. Review ownership can be narrowed later through a governed change.
An author cannot approve their own PR; App-authored control/promotion PRs allow
an authorized independent human review. Agent technical review is not that approval.

## Enrollment readiness evidence (25 November)

Native GitHub readback now confirms both dev and staging require one human
approval, code-owner review and stale-review dismissal. Strict RESX CI/App15368,
admin enforcement, conversation resolution and no-force/no-delete controls were
preserved. This deliberately keeps every PR under review during enrollment,
including currently ownerless prose. No merge or auto-merge operation was run.

The `resx-ci-authoring` environment now exists (ID28557619890), with a custom
branch policy allowing only `dev` of type `branch`; tags are not allowed. No App
secret was provisioned by Deploy. The workflow/control increment is still local;
creation of the environment does not make unmerged workflow source trusted.

## Transition to risk-based review

Keep the one-review enrollment rule until the reviewed CODEOWNERS/control files
are installed on BOTH dev and staging, GitHub reports no CODEOWNERS syntax or
owner-access errors, and an operator reads back the required CI/review rules.
The risk-based ownership change itself is governance and requires authorised
approval; it must not be self-approved by automation.

Then use native CODEOWNERS with `* @nguijoel` as the fallback and explicit,
app-owner-reviewed ownerless entries for named routine UI/prose files. Initial
app-owner proposal is only `/webapp/src/app/shared/components/search/search.component.css`
plus `/README.md` and `/CHANGELOG.md`. The current CSS file is a single search-icon
font-size rule; adjacent TypeScript/templates remain owned. This proposal is NOT
installed or exempted by this record. A future CSS/prose path exemption delegates
risk for its future contents; it is not a semantic guarantee. Review its permitted
scope explicitly before adopting it, and retain ownership if that scope is unclear.

Do not exempt all api/src, webapp/src, docs or a file extension. All workflow/helper,
governance, security/auth/tenant/permissions, infrastructure/container, DB
migration/schema, runtime/environment/configuration, dependency/lock and unknown
paths remain owned. New files remain material until classified through review.
Apply material overrides after routine entries; GitHub uses the last matching
case-sensitive pattern. CODEOWNERS itself always remains owned.

Only after that reviewed ownership policy is on both base branches, change the
global required-approval count from one to zero, retaining mandatory code-owner
review, stale dismissal, strict CI and every other existing protection. This is
what allows routine-only PRs to merge without a human while mixed/material PRs
still require an authorised code owner. Zero global approvals alone is not a
risk policy. A PR author cannot approve their own material PR; an independent
human or App-authored PR is required. Never use a bot approval as a substitute.

Source-risk mapping and representative routine/material/mixed/unknown/rename
review checks must accompany that governance change; ordinary application code
cannot downgrade its own protection through labels or caller booleans. Keep the
current conservative rule if ownership coverage is incomplete. This transition
is separate from PRE activation and does not require any deferred live release.

## Minimum remaining integration

- Verify existing App installation and repository access; Infrastructure provisions
  the approved environment secret after branch/environment restrictions are set.
- Integrate and review the native workflow/CODEOWNERS increment on the protected
  base branches; enable code-owner review without removing existing CI protections.
  The operator verifies the complete rule configuration before enrollment; the
  workflow checks branches are protected and relies on native merge enforcement.
  It does not call Administration-scoped protection-settings APIs or add that
  permission to either token. Checks-only prose requires global approval count
  zero alongside mandatory code-owner review; a positive global count requires
  review for prose too.
- Replace the staging deployment job's explicit fail-closed guard with the smallest
  approved controller transport. Confirm the existing controller's repeat-release,
  digest pull, configuration/DB bindings, semantic duplicate handling and receipts
  are wired through that same path. This is unfinished integration, not an App
  enrollment prerequisite.
- Verify actual GHCR publication/read access and protected retention for current
  plus previous releases; bind the controller's target/configuration/DB references.
- Finish targeted static/security integration checks. No broad application suite
  is required merely for the orchestration rewrite.

Do not activate `RESX_PRE_ENROLLED` while transport/controller bindings are missing.
No new PR is raised until the process is ready. PR6 stays closed and its source
branch is preserved for the later replacement PR.

## Deferred validation and current evidence

The owner deferred first automated release, subsequent release, and explicit
rollback/recovery live proofs. Implementation readiness is not end-to-end
acceptance; no consolidated operational acceptance is claimed before those proofs.
Healthy manual PRE at resx-preview.ontoo.cloud remains on source2d749120/imagebabcca8.
The original no-AWS profile and TR_SECRET remain the first-release configuration;
optional S3 enablement is a separate configuration release. Smoke uses GET only;
never POST login/push. Original predecessor health checks do not require its
nonexistent runtime-info endpoint.

Historical actual hosted source/app/image CI succeeded on source637e86bf,
Actions run45552017483. A failed required-check fixture and a draft fixture were
rejected by GitHub merge controls, PR7 stayed unmerged. These do not qualify the
new native source increment. Its focused local reconciler tests cover native rule
presence, stale/failed CI, draft/no-op behavior, exact-head promotion and
App-authoring ref races/unknown results; no live PR/secret/registry/host call occurs.

## Removed architecture

Custom authoring broker, eligibility evaluator/publisher/watchdog, Docker policy
evaluator, archive collector and new HTTP/OIDC ingress/queue are outside the
selected design. Their historical source/evidence and inactive host files/keys
are preserved; no deletion, key revocation or activation is implied. Earlier
architecture and detailed receipts remain in Git history and protected
Infrastructure custody. The separately created evaluator App is not a dependency
of this native pipeline.

Native limitations: GITHUB_TOKEN-created events can suppress downstream workflows,
so App-authored PRs and explicit dispatch recovery are used; GitHub concurrency
is repository-scoped, so shared-host locking stays in the controller. GitHub does
not provide a preconfigured trusted connection to this Contabo controller.
