FROM node:20-slim

# ffmpeg is the only heavy dep — no Chromium needed (we're not using Remotion here).
RUN apt-get update && apt-get install -y \
  ffmpeg \
  ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .

EXPOSE 3000
CMD ["node", "server.mjs"]
