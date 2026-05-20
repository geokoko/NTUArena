FROM node:22-alpine AS base
WORKDIR /app
COPY package*.json ./

# Test target: installs devDependencies and runs jest. Built explicitly via
# `docker build --target test` from CI. Order matters — the default build
# (no --target) uses the LAST stage, so prod must remain at the bottom to
# keep docker-compose and existing prod builds unchanged.
FROM base AS test
ENV NODE_ENV=test
RUN npm ci
COPY . .
CMD ["npm", "test"]

FROM base AS prod
ENV NODE_ENV=production
ENV PORT=5000
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
