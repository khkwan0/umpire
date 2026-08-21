# Build from the repo root so Vite can glob plugin UI modules:
#   docker compose build web
#   docker build -f web/Dockerfile .
FROM node:lts-bookworm-slim AS build
WORKDIR /src

ARG BASE_PATH=/
ENV BASE_PATH=$BASE_PATH

COPY web/package.json web/package-lock.json* ./web/
WORKDIR /src/web
RUN npm install

WORKDIR /src
COPY web ./web
# App.tsx globs ../../plugins/*/*/ui/index.tsx from web/src
COPY plugins ./plugins

WORKDIR /src/web
RUN npm run build
RUN node scripts/render-nginx.mjs nginx.generated.conf

FROM nginx:alpine
COPY --from=build /src/web/nginx.generated.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/web/dist /usr/share/nginx/html
EXPOSE 80
