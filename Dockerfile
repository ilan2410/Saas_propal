FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED 1

RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

# LibreOffice (pour libreoffice-convert : .docx -> .pdf)
# + fonts et libs natives nécessaires à pdf-to-img / @napi-rs/canvas
RUN apk add --no-cache \
      libreoffice \
      libreoffice-writer \
      ttf-dejavu \
      ttf-liberation \
      fontconfig \
      cairo \
      pango \
      giflib \
      libjpeg-turbo \
 && ln -sf /usr/bin/libreoffice /usr/bin/soffice \
 && soffice --version

# Cache LibreOffice writable par l'utilisateur nextjs
ENV HOME=/home/nextjs

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 --home /home/nextjs nextjs
RUN mkdir -p /home/nextjs && chown -R nextjs:nodejs /home/nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]