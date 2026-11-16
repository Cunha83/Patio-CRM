# Dockerfile para Pátio-CRM v2.1.0 Enterprise
FROM node:20-alpine

WORKDIR /app

# Instala dependências nativas mínimas se necessário
RUN apk add --no-cache python3 make g++ || true

# Instala dependências de produção
COPY package*.json ./
RUN npm ci --only=production --ignore-scripts || npm install --production

# Copia código-fonte da aplicação
COPY . .

# Expõe a porta oficial do Pátio-CRM
EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "server.js"]
