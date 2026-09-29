FROM node:26-slim AS client
WORKDIR /app/client
RUN npm install -g pnpm@9.15.9
COPY client/package.json client/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY client/ ./
RUN pnpm build

FROM litestream/litestream:0.3.13 AS litestream

FROM node:26-slim
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@9.15.9
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile
COPY --from=litestream /usr/local/bin/litestream /usr/local/bin/litestream
COPY deploy/litestream.yml /etc/litestream.yml
COPY deploy/start.sh /app/start.sh
COPY server/src ./server/src
COPY --from=client /app/client/dist ./client/dist
EXPOSE 8080
CMD ["/app/start.sh"]
