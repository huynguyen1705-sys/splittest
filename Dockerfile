FROM node:22-alpine AS build
WORKDIR /app
ENV NPM_CONFIG_PRODUCTION=false
COPY package.json package-lock.json* bun.lockb* ./
RUN npm install --include=dev --no-audit --no-fund
COPY . .
ARG VITE_API_URL=https://api.splittest.app
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM caddy:2-alpine
COPY --from=build /app/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile
EXPOSE 80
