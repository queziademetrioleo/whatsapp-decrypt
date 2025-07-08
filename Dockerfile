FROM node:18

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .

RUN apt-get update && apt-get install -y ffmpeg

EXPOSE 7245
CMD ["node", "index.js"]
