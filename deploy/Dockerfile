FROM node:20-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN npm run build
ENV PORT=8080
EXPOSE 8080
CMD ["node", "engine/server.js"]
