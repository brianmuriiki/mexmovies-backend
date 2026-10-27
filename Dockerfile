FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm install --omit=dev
COPY src ./src
EXPOSE 5000
USER node
CMD ["node", "src/server.js"]
