FROM node:22-slim

ENV NODE_ENV=production \
    TZ=America/Sao_Paulo

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src

# Banco de dados e sessão do WhatsApp ficam aqui (volume)
VOLUME ["/app/dados"]

CMD ["node", "src/index.js"]
