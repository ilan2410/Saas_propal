# Étape 1: Installation des dépendances
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copier les fichiers de dépendances
COPY package.json package-lock.json* ./
RUN npm ci

# Étape 2: Build de l'application
FROM node:20-alpine AS builder
WORKDIR /app

# Copier les dépendances installées
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Variables d'environnement pour le build (Next.js a besoin des NEXT_PUBLIC_* au build time)
ENV NEXT_TELEMETRY_DISABLED 1

# Build Next.js
RUN npm run build

# Étape 3: Production
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

# Créer un utilisateur non-root pour la sécurité
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copier les fichiers statiques
COPY --from=builder /app/public ./public

# Copier le build standalone
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]
```

**Crée aussi un fichier `.dockerignore` à la racine pour optimiser le build :**
```
# .dockerignore
.next
node_modules
.git
.gitignore
README.md
.env
.env.local
.env*.local
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.DS_Store