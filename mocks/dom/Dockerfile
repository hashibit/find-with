FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY server.js ./
RUN mkdir -p fixtures
EXPOSE 14800
CMD ["node", "server.js"]
