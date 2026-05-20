# Test stage: Debian-based because mongodb-memory-server (devDep) downloads
# official mongod binaries built against glibc — Alpine/musl breaks it.
# libcurl4 is a runtime dep of the downloaded mongod binary.
FROM node:22-bookworm-slim AS test
WORKDIR /app
ENV NODE_ENV=test
RUN apt-get update \
 && apt-get install -y --no-install-recommends libcurl4 ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY . .
CMD ["npm", "test"]

# Prod stage stays on Alpine. Must be LAST so the default build (no
# --target) and docker-compose produce the prod image unchanged.
FROM node:22-alpine AS prod
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5000
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .

RUN apk add --no-cache curl dos2unix

COPY --chown=node:node entrypoint.sh /app/entrypoint.sh
RUN dos2unix /app/entrypoint.sh && chmod +x /app/entrypoint.sh

EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD curl -fsS "http://localhost:${PORT}/health" || exit 1

USER node

CMD [ "./entrypoint.sh" ]
