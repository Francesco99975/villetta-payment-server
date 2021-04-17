FROM node:14.12-alpine

RUN apk add --update rsync

WORKDIR /usr/src/app

COPY package.json .

RUN npm install

COPY . .

EXPOSE 3000

CMD [ "npm", "start" ]

