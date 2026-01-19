# 🚀 SaaS Propositions Commerciales

Plateforme SaaS multi-tenant pour automatiser la génération de propositions commerciales dans les secteurs de la téléphonie et de la bureautique.

## 🎯 Fonctionnalités principales

- **Extraction automatique** : Utilise Claude AI pour extraire les données des documents clients (factures, contrats)
- **Génération intelligente** : Remplit automatiquement les templates Office (Word, Excel, PDF) en préservant la mise en forme
- **Multi-tenant** : Gestion de plusieurs clients avec configuration personnalisée
- **Système de crédits** : Paiement par proposition via Stripe
- **Analytics** : Suivi détaillé de l'utilisation et des coûts

## 🏗️ Stack technique

- **Frontend/Backend** : Next.js 14+ (App Router) + TypeScript
- **Base de données** : Supabase (PostgreSQL + Auth + Storage)
- **IA** : Anthropic Claude 3.5 Sonnet
- **Paiement** : Stripe
- **UI** : TailwindCSS + shadcn/ui
- **Documents** : docxtemplater, exceljs, pdf-lib

## 📦 Installation

```bash
# Installer les dépendances
npm install

# Copier le fichier d'environnement
cp .env.example .env.local

# Configurer les variables d'environnement dans .env.local
# - Supabase (URL, clés)
# - Anthropic API Key
# - Stripe (clés, webhook secret)

# Lancer le serveur de développement
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000) dans votre navigateur.

## 📁 Structure du projet

```
/app
  /api                    # API Routes
    /admin               # Routes admin
    /organizations       # Routes clients
    /stripe              # Intégration Stripe
    /claude              # Extraction IA
  /admin                 # Interface admin
  /(auth)                # Interface client authentifiée
    /dashboard
    /templates
    /propositions
    /credits
/lib
  /ai                    # Client Claude
  /stripe                # Client Stripe
  /parsers               # Parsers PDF/Word/Excel
  /generators            # Générateurs de documents
  /supabase              # Client Supabase
/components
  /admin                 # Composants admin
  /client                # Composants client
  /ui                    # Composants shadcn/ui
```

## 🚀 Déploiement

Le projet est conçu pour être déployé sur un VPS avec Coolify.

Voir `instructions.md` pour les détails complets du déploiement.

## 📝 Documentation

- `instructions.md` : Spécifications techniques complètes
- `plan.md` : Plan de développement en 9 phases
