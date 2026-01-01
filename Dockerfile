FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .

RUN npm run codegen
RUN npx tsc

EXPOSE 4000

CMD ["node", "dist/app.js"]
