FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5000

COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN apk add --no-cache curl

EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD curl -fsS "http://localhost:${PORT}/health" || exit 1

USER node
CMD [ "sh", "-c", "npm run seed || true && npm start" ]
# second to last CMD is ignored
CMD [ "npm", "run", "simulate:tournament"]
