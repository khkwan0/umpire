# Build from the repo root so Vite can glob plugin UI modules:
#   docker compose build web
#   docker build -f web/Dockerfile .
FROM node:lts-bookworm-slim AS build
WORKDIR /src

COPY web/package.json web/package-lock.json* ./web/
WORKDIR /src/web
RUN npm install

WORKDIR /src
COPY web ./web
# App.tsx globs ../../plugins/*/*/ui/index.tsx from web/src
COPY plugins ./plugins

WORKDIR /src/web
RUN npm run build

FROM nginx:alpine
COPY web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/web/dist /usr/share/nginx/html
EXPOSE 80
