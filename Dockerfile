FROM node:22

WORKDIR /app

COPY package*.json ./
RUN npm install

# COPY THE REST OF THE APP
COPY . .

# EXPOSE PORT
EXPOSE 3000

CMD ["npm", "start"]
