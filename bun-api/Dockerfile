FROM oven/bun:1-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY package.json bun.lock ./

RUN bun install --frozen-lockfile --production

COPY src ./src
COPY tsconfig.json ./

EXPOSE 3000

CMD ["bun", "src/cluster.ts"]
