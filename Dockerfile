# Usa una imagen con Node y Chromium
FROM zenika/alpine-chrome:with-node

# Crear directorio de trabajo
WORKDIR /app

# Copiar archivos
COPY . .

# Instalar dependencias
RUN npm install

# Puerto
EXPOSE 3000

# Comando por defecto
CMD ["npm", "start"]
