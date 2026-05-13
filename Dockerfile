FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./
COPY src ./src

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

VOLUME ["/data"]

CMD ["node", "src/server.js"]
