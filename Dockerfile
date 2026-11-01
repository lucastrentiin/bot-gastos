# Etapa 1: instala as dependências (com compiladores, caso o servidor seja ARM e precise compilar o SQLite)
FROM node:22-slim AS deps
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Etapa 2: imagem final, pequena
FROM node:22-slim
ENV NODE_ENV=production \
    TZ=America/Sao_Paulo
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src

# Banco de dados e login do WhatsApp ficam aqui
VOLUME ["/app/dados"]
CMD ["node", "src/index.js"]
