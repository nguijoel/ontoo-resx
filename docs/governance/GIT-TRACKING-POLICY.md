# RESX Git tracking manifest

Repository: nguijoel/ontoo-resx (ID 795522855)
Code owner: RESX Developer
Central policy: ONTOO-GIT-001 v1.0.0, canonical in ONTOO docs
Reviewed: 2026-11-24
Status: Remediation pending; this increment does not certify the inherited index.

## Declared maintained inputs

| Category | Scope | Purpose |
|---|---|---|
| G01 | api/src/**, webapp/src/** (excluding generated output) | Maintained application source |
| G09 | bin/resx-phase1.cjs, bin/resx-phase1-profile.cjs | Dedicated local PRE connection tooling |
| G05 | bin/resx-phase1.test.cjs | Deterministic profile and TLS test implementation |
| G06 | docs/resx-phase1-local.md, docs/governance/GIT-TRACKING-POLICY.md | Maintained application operating contract and local manifest |

Other inherited paths require repository-wide classification before new changes
are staged there. This list grants no new canonical policy exceptions.

## Exclusions and evidence

Central exclusions X01â€“X11 apply. Never stage live .env files, database archives,
private keys, credentials, dependency installs, build output or execution evidence.
Tests generate disposable certificates/private keys only in OS temp and remove
their own temporary directory. Runtime profiles and real CA/custody files stay
outside this repository. No persistent raw evidence destination is enrolled by
this change; record only safe run/commit references in review. Artifact destination,
retention and access ownership remain an Infrastructure/Deploy dependency.

## Enforcement and existing content

Review exact staged paths, whitespace and credential/output classification before
commit. This initial manifest has no machine category checker or hosted required
check enrolled. CI/staged policy enforcement and full inherited-index audit remain
open adoption work; do not claim compliance or silently approve existing debt.
No exception, history rewrite, dependency removal or index cleanup is authorized.
Preserve owner edits, archives and upstream branch configuration.
