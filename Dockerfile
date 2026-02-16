FROM node:25-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .

RUN npx tsc

EXPOSE 4000

CMD ["node", "dist/app.js"]
