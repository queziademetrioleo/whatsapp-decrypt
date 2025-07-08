# Usa imagem Node com suporte a Debian (mais fácil instalar ffmpeg)
FROM node:18-slim

# Instala o ffmpeg
RUN apt-get update && apt-get install -y ffmpeg

# Define o diretório de trabalho
WORKDIR /app

# Copia os arquivos de dependência
COPY package*.json ./

# Instala dependências do projeto
RUN npm install

# Copia o restante do código
COPY . .

# Expõe a porta da API
EXPOSE 7245

# Comando de execução
CMD ["node", "index.js"]
