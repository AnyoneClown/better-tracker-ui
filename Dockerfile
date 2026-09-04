FROM node:24-bookworm-slim

ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=43127

EXPOSE 43127

CMD ["npm", "run", "start"]
