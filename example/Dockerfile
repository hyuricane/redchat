# base
FROM node:20 AS base

WORKDIR /usr/src/app
ADD . .
RUN npm ci --production-only && npm run build
RUN cd example && npm ci --production-only
# RUN touch dummy.txt
# CMD ["tail", "-f", "dummy.txt"]

# development
FROM base AS development
RUN npm install --global nodemon concurrently
ENV PORT=80
WORKDIR /usr/src/app/example
CMD ["nodemon", "app.js"]

# production
FROM node:20-slim AS production
COPY --from=base /usr/src/app /usr/src/app
WORKDIR /usr/src/app/example
ENV PORT=80
CMD ["node", "app.js"]