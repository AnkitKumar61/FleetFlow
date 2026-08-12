FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
RUN npm ci

FROM deps AS client-build
COPY client client
RUN npm run build -w client

FROM node:22-alpine AS server
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules node_modules
COPY package*.json ./
COPY server server
RUN mkdir -p uploads && chown node:node uploads
USER node
EXPOSE 4000
CMD ["node", "server/src/index.js"]

FROM nginx:1.27-alpine AS client
COPY --from=client-build /app/client/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
