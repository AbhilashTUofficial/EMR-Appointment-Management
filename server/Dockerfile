# Build from the repository root: docker build -f server/Dockerfile .
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci -w server
COPY server server
RUN npm run build -w server

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci -w server --omit=dev
COPY --from=build /app/server/dist server/dist
USER node
EXPOSE 4000
CMD ["node", "server/dist/server.js"]
