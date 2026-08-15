FROM node:22-alpine

WORKDIR /app

COPY package.json .
COPY server.mjs .
COPY config ./config
COPY lib ./lib
COPY public ./public

ENV PORT=3000

EXPOSE 3000

CMD ["npm", "start"]
