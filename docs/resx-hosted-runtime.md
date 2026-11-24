# Isolated RESX hosted PRE and local DEV runtime

Delivery sequence: deploy the app against qualified PRE, then qualify the separate
DEV database and point localhost to DEV. Functional tests follow endpoint delivery.
Source profiles do not create databases, routes, networks, accounts or credentials.

## Hosted image and routing

Build only from an immutable Git-tree export using deploy/resx/build-inputs.json
and Infrastructure's allowlisted context generator. Never recursively upload the
dirty checkout, ignored files, symlinks or unclassified files. Record the exact
source commit and context manifest hash in the build receipt. Use the exported
repository-root layout with deploy/resx/Dockerfile. The Dockerfile pins Infrastructure's qualified Node 22.23.5 / Debian bookworm /
linux-amd64 base directly to:

    docker.io/library/node@sha256:47725aca53d3295ec2d3be8f62726599b3033cc262edc2c7e429909b3ac599fc

No floating base tag or runtime image override is used.
Yarn 1.22.22 and the committed yarn.lock provide dependency inputs. Dedicated
Dockerfile.dockerignore excludes dotenv, DB data, dependencies and local evidence.
The context manifest permits only named JSON build configs; arbitrary JSON,
*.env, certificates, keys, archives and DB artifacts are excluded. No secret is a build argument. Build fails if frozen dependency resolution fails;
do not regenerate the lockfile implicitly.

Runtime is nonroot numeric uid/gid 10001:10001 (matching the existing controller), HTTP 0.0.0.0:8080, compiled
node dist/src/main.js launched through bin/resx-runtime.cjs. The API serves
dist/public/index.html and static assets plus SPA route fallback. Health is /health
on the same internal port. Caddy owns public TLS/route resx-preview.ontoo.cloud.
Frontend preview configuration uses same-origin /api/v1, preview homepage, no CDN
flags, invitation-only UI. Existing production frontend configuration is unchanged.

    # Run only inside the immutable allowlisted export, never the dirty checkout.
    docker build -f deploy/resx/Dockerfile -t <candidate> .

Protect/mount /run/secrets/resx-hosted-pre.env read-only for uid 10001 and its CA
file at the referenced absolute path. Required fields:

    TR_DB_TYPE=mysql
    TR_DB_DATABASE=ontoo_resx_pre
    TR_DB_USER=ontoo_resx_pre_runtime
    TR_DB_HOST=localhost
    TR_DB_NETWORK_HOST=172.21.0.2
    TR_DB_PORT=3306
    TR_DB_CA_FILE=/run/secrets/resx-pre-db-ca.pem
    TR_DB_PASSWORD=<PRE runtime secret from custodian>
    TR_SECRET=<separate PRE signing secret from custodian>

Infrastructure's selected PRE database is exact CID f452, private IP
172.21.0.2:3306 on ontoo-resx-pre-db. The app must join that owned database network
and its separately approved app network for loopback host publish. Proposed host
publish is 127.0.0.1:20003 to container8080; no public database port. A replaced
container/IP requires explicit requalification and source-contract review.
The TCP stream dials only that fixed IP; mysql2's host remains localhost for
SNI and CA/hostname verification against Infrastructure's frozen localhost leaf.
No plaintext, ssl:false or rejectUnauthorized:false fallback exists.

The launcher accepts no arbitrary target and sanitizes its child environment.
All three dotenv loaders are bypassed for these profiles. Synchronize is false;
migrations, seeding, signups, Google auth, SMTP/debug previews, AWS and shared Redis
are disabled. Hosted CORS is disabled (same origin). No runtime npm/yarn install. Preview-only Sass suppresses external Google font
imports as well as CDN flags; existing non-preview styles retain their defaults.
The existing controller's read-only rootfs can remain enabled; runtime has no
write requirement beyond approved temporary memory-backed paths. Map the protected
host profile (existing /etc/ontoo/pre/resx.env custody model) to the fixed container
secret-file path, rather than relying on ambient env-file injection alone. Profile
and CA must be readable by uid10001. Agreed custody: runtime profile root:10001
mode0440 under root0700 host custody; public CA mode0444, both mounted read-only.
Preserve cap-drop, no-new-privileges and read-only rootfs. No global permission
changes are implied.
DB restore/integrity/recovery and minimal connection/startup readiness remain
required; health alone does not certify imported-data functionality.

## Local DEV, only after qualified DEV initialization

Keep PRE unchanged. Distinct target/account/password/CA handoff is required:

    TR_DB_TYPE=mysql
    TR_DB_DATABASE=ontoo_resx_dev
    TR_DB_USER=ontoo_resx_dev_runtime
    TR_DB_HOST=localhost
    TR_DB_TUNNEL_PORT=<Infrastructure-qualified DEV loopback port>
    TR_DB_CA_FILE=C:/approved/path/resx-dev-ca.pem
    TR_DB_PASSWORD=<DEV runtime secret from custodian>
    TR_SECRET=<separate local DEV signing secret>

    node bin/resx-runtime.cjs --check resx-local-dev C:/approved/path/resx-dev.env
    node bin/resx-runtime.cjs resx-local-dev C:/approved/path/resx-dev.env

API binds 127.0.0.1:3006; frontend yarn start:web uses localhost:4208 and API3006.
Do not use yarn dev/start:api for the isolated profile (ambient dotenv/mail debug).
A DEV profile cannot select PRE/PROD or the PRE account. No DEV connection is
authorized by this document before DBA/Infrastructure qualify that separate target.

## Verification and limitations

Run node --test bin/resx-phase1.test.cjs bin/resx-runtime.test.cjs and API typecheck.
Build the preview SPA and compiled API without real credentials. Container Linux
dependency resolution, native bcrypt, image UID, network/DNS and mounted CA access
must be verified on the actual qualified builder/runtime; a Windows build does
not certify a Linux image. Do not deploy an unbuilt/unqualified candidate.

Keep known imported schema differences and DBA restore reconciliation in their
existing contracts. Login/representative writes and broad browser/E2E validation
are deferred until PRE app, DEV database and DEV-local endpoint are delivered.
