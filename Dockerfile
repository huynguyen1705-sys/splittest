# Frontend Dockerfile — builds Vite + serves via Caddy
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* bun.lockb* ./
RUN npm install --no-audit --no-fund
COPY . .
ARG VITE_API_URL=https://api.splittest.app
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM caddy:2-alpine
COPY --from=build /app/dist /srv
RUN echo ':80\n\
root * /srv\n\
encode gzip zstd\n\
file_server\n\
try_files {path} /index.html\n\
header /assets/* Cache-Control "public, max-age=31536000, immutable"\n\
' > /etc/caddy/Caddyfile
EXPOSE 80
