FROM node:20-alpine AS dependencies

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:20-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3003

COPY --from=dependencies /app/node_modules ./node_modules
COPY package*.json ./
COPY src ./src

USER node
EXPOSE 3003

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3003/health', res => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "src/server.js"]

