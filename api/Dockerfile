# Build from the repo root (plugins live next to api/):
#   docker compose build api
#   docker build -f api/Dockerfile .
FROM node:current-bookworm-slim AS build
WORKDIR /src
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY api/package.json api/package-lock.json* ./api/
COPY agent/package.json agent/tsconfig.json ./agent/
COPY agent/src ./agent/src
WORKDIR /src/agent
RUN npm install && npm run build
WORKDIR /src
COPY api/package.json api/package-lock.json* ./api/
WORKDIR /src/api
RUN npm install
WORKDIR /src
COPY api/tsconfig.json ./api/tsconfig.json
COPY api/plugins.json ./api/plugins.json
COPY api/src ./api/src
COPY plugins ./plugins
WORKDIR /src/api
RUN npm run build && npm prune --omit=dev \
  && rm -rf node_modules/umpire-agent \
  && mkdir -p node_modules/umpire-agent \
  && cp ../agent/package.json node_modules/umpire-agent/ \
  && cp -r ../agent/dist node_modules/umpire-agent/

FROM node:current-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libstdc++6 curl \
  && rm -rf /var/lib/apt/lists/*
COPY --from=build /src/api/package.json ./
COPY --from=build /src/api/plugins.json ./
COPY --from=build /src/api/node_modules ./node_modules
COPY --from=build /src/api/dist ./dist
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/api/src/index.js"]
