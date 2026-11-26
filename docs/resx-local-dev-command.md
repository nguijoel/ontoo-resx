# One-command isolated RESX DEV startup

Use this only after Infrastructure and DBA qualify the separate DEV database,
runtime account, private tunnel and localhost-identity TLS CA. It does not create
or restore a DB, establish SSH, retire the SQLite preview or perform acceptance.

Infrastructure must hand off the absolute protected DEV profile path. There is
no guessed/default path and no PRE fallback. Set its reference once in your shell:

    $env:RESX_DEV_ENV_FILE = 'C:/Infrastructure-issued/protected/resx-dev.env'

Then from C:/Dev/Repos/ontoo-resx:

    yarn dev:resx --check
    yarn dev:resx

The check starts neither service and makes no DB connection. The single startup
command runs API127.0.0.1:3006 and frontend127.0.0.1:4208. Open
http://localhost:4208. Generic yarn dev remains unchanged; use dev:resx for the
actual isolated DEV workflow. Stop with Ctrl+C; sibling failure stops the other
owned child, without terminating unrelated existing services.

The API receives only the validated resx-local-dev environment (ontoo_resx_dev /
ontoo_resx_dev_runtime, verified localhost TLS CA, explicit DEV tunnel port).
Migrations, seeds, SMTP/mail debug, imported providers, AWS and shared Redis stay
off. The frontend receives no DB credentials or signing secret. No shell command
contains a credential value; no dotenv fallback occurs. The normal development
frontend retains its existing external font/flag behavior.

Profile field names and DB/TLS semantics remain in resx-hosted-runtime.md.
Do not set RESX_DEV_ENV_FILE to a checked-in file or existing production profile.
Actual path/port/credentials remain an Infrastructure custody handoff, not invented
by this script. Keep old8080SQLite running until actualDEVAPI3006/web4208 startup
is confirmed under the agreed delivery order.

This source-only follow-up does not change hosted freeze2d74912 or require that
in-progress image build to rerun. Its root package script is for the later local
checkout update; use the previously frozen SHA for the hosted image build.

Regression check: node --test bin/resx-dev.test.cjs (synthetic CA; no DB/startup).
