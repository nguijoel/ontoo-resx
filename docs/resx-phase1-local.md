# RESX phase one: local app to isolated PRE MariaDB

Source baseline: dev edbf651, repository nguijoel/ontoo-resx (ID 795522855).
This profile starts only the local API. It does not deploy the app, create a
tunnel, restore a dump, run migrations, seed data, or create database accounts.

## Prerequisites

DBA must accept restore identity, integrity, migration history, recovery, and the
test account/write scope. Infrastructure must hand off the pinned private SSH
tunnel, its local port, and the database TLS CA plus certificate DNS identity.
The logical target is exactly ontoo_resx_pre. A local client does not change its
environment designation. Do not reuse production credentials or a production DB.

The selected ZIP SHA256 is
447a045ea12d65ccf27f646d692fdb192753ef7a395b9a42eaf74f3c899e265d.
Its SQL member SHA256 is
35877254af65ccab26ae94c8e2ffc48eba5773953a5ee72be18d29688fb4412b.
Preserve dump bytes/source alias ontoo_m_tr. Its 19 migration class names match
source. Static discrepancies: label.color is varchar(7), entity length 8;
translation.value is mediumtext, entity text. No schema synchronization or
automatic narrowing is permitted. Native DBA validation remains required.

## Dedicated profile

Have the approved credential custodian provide a dedicated untracked file outside
the repository. Never copy a live profile into Git or canonical policy files.
Required names (values below are placeholders, not an issued connection):

    TR_DB_TYPE=mysql
    TR_DB_DATABASE=ontoo_resx_pre
    TR_DB_HOST=certificate-dns-name.example.invalid
    TR_DB_TUNNEL_PORT=13306
    TR_DB_CA_FILE=C:/approved/path/database-ca.pem
    TR_DB_USER=isolated_runtime_account
    TR_DB_PASSWORD=<custodian supplied>
    TR_SECRET=<isolated local signing secret>

TR_DB_HOST is the database certificate identity, not the tunnel IP. The TCP
stream always connects to 127.0.0.1 at TR_DB_TUNNEL_PORT. mysql2 verifies the CA
and certificate hostname, using TR_DB_HOST for SNI/identity without public DNS
resolution. TLS has no insecure or plaintext fallback. The launcher does not
establish or authenticate SSH; Infrastructure owns that separate pinned tunnel.
The application explicitly uses mysql2; MariaDB uses the application's mysql
compatibility mode. Do not set TR_DB_TYPE=mariadb (unsupported by app helpers).

From C:/Dev/Repos/ontoo-resx:

    node bin/resx-phase1.cjs --check C:/approved/path/resx-phase1.env
    node bin/resx-phase1.cjs C:/approved/path/resx-phase1.env

The check parses configuration and CA without connecting. Start only after the
prerequisites are accepted. Do not use yarn dev or yarn start:api for this profile:
normal startup forces mail debug and reads ambient dotenv files. This launcher
preloads only selected profile fields into a fresh child environment; root/api
dotenv loading is disabled for this profile, including Nest ConfigModule.
Inherited NODE_OPTIONS, AWS, Google, SMTP, Redis, and other imported settings are
not passed through. Signups, mail previews, migrations, seeds, and access logs are
disabled. API binds 127.0.0.1:3006; normal source defaults stay unchanged.

For the local frontend, use yarn start:web only in a clean frontend environment.
Its development URL is http://localhost:4208 and API endpoint is
http://localhost:3006/api/v1. It currently loads flag images from flagcdn.com:
local browser activity is not an offline test. No VPS application upload or DNS
change is part of phase one. The separate 8080 empty-SQLite preview is unrelated.

## Acceptance sequence

1. Confirm source SHA, exact target, tunnel/TLS identity and DBA restore receipt;
   read-only schema/row-count/integrity checks belong to DBA.
2. Verify local API health and provider list (Google disabled), then local browser
   route refresh and frontend-to-3006 requests.
3. Use only the agreed test account for login and project/locale/term/translation
   reads. Never print credentials, tokens, user content, or dump rows in evidence.
   Login is a WRITE: it saves the user and may change login attempt metadata.
4. A representative translation write needs a separately agreed fixture/project,
   before-image and cleanup/recovery scope. Do not probe arbitrary imported data.
   Keep label values within dump length 7 and avoid schema changes.
5. Record safe status codes, source SHA, target alias, test case identifiers and
   restoration/cleanup outcome. A green health endpoint is not login acceptance.

Local regression checks (no VPS or real credentials):

    node --test bin/resx-phase1.test.cjs
    node node_modules/typescript/bin/tsc -p api/tsconfig.json --noEmit

The TLS tests generate disposable self-signed test material with openssl in OS
temp and exercise the installed mysql2 TLS upgrade with valid CA/name, wrong
name, and untrusted CA. This tests the transport; native imported MariaDB and
browser acceptance still require the handoffs above.
