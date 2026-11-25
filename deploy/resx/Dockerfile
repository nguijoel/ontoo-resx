# Build only from the immutable allowlisted Git export.
# Infrastructure-qualified Node 22.23.5 / Debian bookworm / linux-amd64.
FROM docker.io/library/node@sha256:47725aca53d3295ec2d3be8f62726599b3033cc262edc2c7e429909b3ac599fc AS builder
USER 0
WORKDIR /opt/resx
RUN node -e "if(process.versions.node.split('.')[0]!=='22')process.exit(1)"
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare yarn@1.22.22 --activate
COPY package.json yarn.lock ./
COPY api/package.json api/package.json
COPY webapp/package.json webapp/package.json
COPY docs-website/package.json docs-website/package.json
RUN yarn install --frozen-lockfile --non-interactive
COPY api api
COPY webapp webapp
COPY bin/resx-phase1-profile.cjs bin/resx-runtime-profile.cjs bin/resx-runtime.cjs bin/
RUN node node_modules/typescript/bin/tsc -p api/tsconfig.json \
    && cp -r api/src/templates dist/src/templates \
    && cp api/package.json dist/package.json \
    && cd webapp && NODE_OPTIONS=--openssl-legacy-provider node --max-old-space-size=4096 node_modules/@angular/cli/bin/ng.js build --configuration=preview
# Install only the exact locked API dependency graph for runtime.
RUN cp package.json package.build.json \
    && node -e "const fs=require('fs'),p=require('./api/package.json');delete p.devDependencies;delete p.scripts;delete p.jest;fs.writeFileSync('package.json',JSON.stringify(p))" \
    && rm -rf node_modules api/node_modules webapp/node_modules docs-website/node_modules \
    && yarn install --production --frozen-lockfile --non-interactive

FROM docker.io/library/node@sha256:47725aca53d3295ec2d3be8f62726599b3033cc262edc2c7e429909b3ac599fc AS runtime
WORKDIR /opt/resx
ENV NODE_ENV=production
COPY --from=builder --chown=10001:10001 /opt/resx/dist dist
COPY --from=builder --chown=10001:10001 /opt/resx/node_modules node_modules
COPY --from=builder --chown=10001:10001 /opt/resx/bin bin
USER 10001:10001
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/health',{signal:AbortSignal.timeout(4000)}).then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
ENTRYPOINT ["node", "bin/resx-runtime.cjs", "resx-hosted-pre", "/run/secrets/resx-hosted-pre.env"]
