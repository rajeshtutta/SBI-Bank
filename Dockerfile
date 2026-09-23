FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY sql ./sql
COPY scripts ./scripts
COPY .env.example ./.env.example

ENV NODE_ENV=production
EXPOSE 3000

USER node

CMD ["node", "src/server.js"]
