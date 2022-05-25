FROM node:latest

ADD src ./src
ADD package.json .
ADD tsconfig.json .

RUN npm install typescript -g
RUN npm install

RUN tsc

CMD [ "node", "dist/server.js" ]
