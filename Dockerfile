# syntax=docker/dockerfile:1

# Self-contained image: the static site (UI, api/ JSON, generated Terraform) is baked in at build time,
# so the container needs no network access at runtime.

# Base images are pinned by version tag and digest (multi-arch index) so builds are reproducible and Dependabot
# (docker ecosystem, see .github/dependabot.yml) can propose updates for both.
# The site is plain static files, so the build stage always runs on the build host's platform
# (no emulation when the final image is built for several architectures).
FROM --platform=$BUILDPLATFORM docker.io/library/node:22.23.4-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914 AS build
WORKDIR /app
COPY package.json ./
COPY json ./json
COPY src ./src
COPY site ./site
# Provider versions are looked up in the Terraform Registry while building. A failed lookup is not an error
# (pinned defaults are used); set AZL_OFFLINE=1 to skip the lookup entirely.
ARG AZL_OFFLINE=0
ENV AZL_OFFLINE=${AZL_OFFLINE}
RUN node src/build-site.js

FROM docker.io/nginxinc/nginx-unprivileged:1.30.6-alpine@sha256:f5116ed4606f3eb015dd4a8e28cb9b351476dc0ad4bc6e9f93b19cec130cdf03

ARG BUILD_DATE=""
ARG VCS_REF=""
ARG DATA_UPDATED=""

LABEL org.opencontainers.image.title="Azure Local Endpoints" \
      org.opencontainers.image.description="Browse Azure Local firewall endpoints and generate Terraform for firewalls. Community-driven, unofficial tool; not affiliated with or endorsed by Microsoft. Verify generated rules against the official documentation before deploying." \
      org.opencontainers.image.source="https://github.com/erikgraa/azure-local-endpoints" \
      org.opencontainers.image.url="https://endpoints.azl.graa.dev" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.revision="${VCS_REF}" \
      dev.graa.azure-local-endpoints.data-updated="${DATA_UPDATED}" \
      dev.graa.azure-local-endpoints.disclaimer="Community-driven, unofficial tool. Not affiliated with, endorsed by, or sponsored by Microsoft. Provided as-is, without warranty."

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

# nginx-unprivileged already runs as the non-root user "nginx" (uid 101) and listens on 8080.
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
