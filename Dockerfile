# syntax=docker/dockerfile:1
FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY server.js ./
COPY public/ ./public/

EXPOSE 6413

ENV PORT=6413

CMD ["node", "server.js"]
