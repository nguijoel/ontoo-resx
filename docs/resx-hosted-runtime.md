# Isolated RESX hosted PRE and local DEV runtime

Delivery sequence: deploy the app against qualified PRE, then qualify the separate
DEV database and point localhost to DEV. Functional tests follow endpoint delivery.
Source profiles do not create databases, routes, networks, accounts or credentials.

## Hosted image and routing

Build from repository root with deploy/resx/Dockerfile. Supply NODE_IMAGE as the
Infrastructure-approved immutable Node 22 Debian bookworm-slim reference including
its sha256 digest; the Dockerfile intentionally has no floating default.
Yarn 1.22.22 and the committed yarn.lock provide dependency inputs. Dedicated
Dockerfile.dockerignore excludes dotenv, DB data, dependencies and local evidence.
No secret is a build argument. Build fails if frozen dependency resolution fails;
do not regenerate the lockfile implicitly.

Runtime is nonroot node (standard image uid/gid 1000), HTTP 0.0.0.0:8080, compiled
node dist/src/main.js launched through bin/resx-runtime.cjs. The API serves
dist/public/index.html and static assets plus SPA route fallback. Health is /health
on the same internal port. Caddy owns public TLS/route resx-preview.ontoo.cloud.
Frontend preview configuration uses same-origin /api/v1, preview homepage, no CDN
flags, invitation-only UI. Existing production frontend configuration is unchanged.

    docker build -f deploy/resx/Dockerfile --build-arg NODE_IMAGE=<qualified-digest-reference> -t <candidate> .

Protect/mount /run/secrets/resx-hosted-pre.env read-only for uid 1000 and its CA
file at the referenced absolute path. Required fields:

    TR_DB_TYPE=mysql
    TR_DB_DATABASE=ontoo_resx_pre
    TR_DB_USER=ontoo_resx_pre_runtime
    TR_DB_HOST=localhost
    TR_DB_NETWORK_HOST=ontoo-resx-mariadb-pre
    TR_DB_PORT=3306
    TR_DB_CA_FILE=/run/secrets/resx-pre-db-ca.pem
    TR_DB_PASSWORD=<PRE runtime secret from custodian>
    TR_SECRET=<separate PRE signing secret from custodian>

Infrastructure must confirm/provide the exact private database network alias
ontoo-resx-mariadb-pre:3306 to this app container before launch. It is a source
contract, not a claim that an alias/route is already installed. No public DB port.
The TCP stream resolves only that fixed alias; mysql2's host remains localhost for
SNI and CA/hostname verification against Infrastructure's frozen localhost leaf.
No plaintext, ssl:false or rejectUnauthorized:false fallback exists.

The launcher accepts no arbitrary target and sanitizes its child environment.
All three dotenv loaders are bypassed for these profiles. Synchronize is false;
migrations, seeding, signups, Google auth, SMTP/debug previews, AWS and shared Redis
are disabled. Hosted CORS is disabled (same origin). No runtime npm/yarn install. Preview-only Sass suppresses external Google font
imports as well as CDN flags; existing non-preview styles retain their defaults.
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
