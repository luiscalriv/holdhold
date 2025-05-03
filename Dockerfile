# Usa Node oficial
FROM node:20-slim

# Instala dependencias necesarias para Puppeteer
RUN apt-get update && apt-get install -y \
  wget \
  ca-certificates \
  fonts-liberation \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libcups2 \
  libdbus-1-3 \
  libgdk-pixbuf2.0-0 \
  libnspr4 \
  libnss3 \
  libx11-xcb1 \
  libxcomposite1 \
  libxdamage1 \
  libxrandr2 \
  xdg-utils \
  libglib2.0-0 \
  libgbm1 \
  libpango-1.0-0 \
  libxss1 \
  libgtk-3-0 \
  && rm -rf /var/lib/apt/lists/*

# Crea carpeta de app
WORKDIR /app

# Copia y instala dependencias
COPY package*.json ./
RUN npm install

# Copia el código
COPY . .

# Expone el puerto
EXPOSE 3000

# Comando de inicio
CMD ["node", "index.js"]
