# backend/Dockerfile
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=development
ENV PORT=5000

# Install dependencies
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

RUN apk add --no-cache curl

EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD curl -fsS "http://localhost:${PORT}/health" || exit 1

USER node
CMD ["npm", "start"]
