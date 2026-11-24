# Build from repo root. NODE_IMAGE must be an Infrastructure-qualified immutable
# Node 22 Debian bookworm-slim image reference (including @sha256 digest).
ARG NODE_IMAGE
FROM ${NODE_IMAGE} AS builder
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

ARG NODE_IMAGE
FROM ${NODE_IMAGE} AS runtime
WORKDIR /opt/resx
ENV NODE_ENV=production
COPY --from=builder --chown=node:node /opt/resx/dist dist
COPY --from=builder --chown=node:node /opt/resx/node_modules node_modules
COPY --from=builder --chown=node:node /opt/resx/bin bin
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/health',{signal:AbortSignal.timeout(4000)}).then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
ENTRYPOINT ["node", "bin/resx-runtime.cjs", "resx-hosted-pre", "/run/secrets/resx-hosted-pre.env"]
