FROM oven/bun:1 AS web-builder
WORKDIR /app
COPY package.json bun.lock* ./
COPY packages/web/package.json ./packages/web/package.json
COPY packages/engine/package.json ./packages/engine/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/api/package.json ./packages/api/package.json
COPY packages/data/package.json ./packages/data/package.json
RUN bun install --frozen-lockfile
COPY packages/web ./packages/web
COPY packages/engine ./packages/engine
COPY tsconfig.base.json ./
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
RUN bun run --cwd packages/web build

FROM oven/bun:1
WORKDIR /app
COPY package.json bun.lock* ./
COPY packages/api/package.json ./packages/api/package.json
COPY packages/engine/package.json ./packages/engine/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/data/package.json ./packages/data/package.json
COPY packages/web/package.json ./packages/web/package.json
RUN bun install --frozen-lockfile --production
COPY packages/api ./packages/api
COPY packages/engine ./packages/engine
COPY packages/db ./packages/db
COPY packages/data ./packages/data
COPY tsconfig.base.json ./
COPY --from=web-builder /app/packages/web/dist ./packages/web/dist
EXPOSE 3001
CMD ["bun", "run", "packages/api/src/index.ts"]
