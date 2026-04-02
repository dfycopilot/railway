FROM node:20-slim

# Install Chromium dependencies for Remotion headless rendering
RUN apt-get update && apt-get install -y \
  chromium \
  fonts-liberation \
  libgbm1 \
  libnss3 \
  libxss1 \
  libasound2 \
  --no-install-recommends && \
  rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_DOWNLOAD=true

WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY . .

EXPOSE 3001
CMD ["node", "server.js"]
