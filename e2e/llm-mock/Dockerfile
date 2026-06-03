FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.js ./
RUN mkdir -p fixtures
EXPOSE 11435
CMD ["node", "server.js"]
