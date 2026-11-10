# syntax=docker/dockerfile:1.7
# Electro Demo CRM — многоступенчатая сборка Next.js (output: standalone)

FROM node:24-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:24-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Образ для миграций и seed (полные зависимости + исходники): docker compose run --rm migrate
FROM builder AS tools
ENV NODE_ENV=production
CMD ["npm", "run", "setup"]

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 STORAGE_LOCAL_DIR=/app/uploads
RUN apk add --no-cache tini && addgroup -S demo -g 1001 && adduser -S demo -u 1001 -G demo
COPY --from=builder --chown=demo:demo /app/public ./public
COPY --from=builder --chown=demo:demo /app/.next/standalone ./
COPY --from=builder --chown=demo:demo /app/.next/static ./.next/static
# шрифты с кириллицей и казахскими буквами для PDF и SQL-миграции
COPY --from=builder --chown=demo:demo /app/assets ./assets
COPY --from=builder --chown=demo:demo /app/drizzle ./drizzle
RUN mkdir -p /app/uploads && chown demo:demo /app/uploads
USER demo
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
