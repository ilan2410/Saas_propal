# 📊 Configuration Supabase

Ce dossier contient les scripts SQL pour configurer la base de données Supabase.

## 🚀 Installation

### Étape 1 : Accéder à votre projet Supabase

1. Connectez-vous à votre VPS où Supabase est installé
2. Ou connectez-vous à https://supabase.com/dashboard si vous utilisez Supabase Cloud

### Étape 2 : Exécuter le schéma de base de données

1. Dans le dashboard Supabase, allez dans **SQL Editor**
2. Créez une nouvelle query
3. Copiez tout le contenu de `schema.sql`
4. Collez-le dans l'éditeur SQL
5. Cliquez sur **Run** pour exécuter

Cela va créer :
- ✅ 5 tables (organizations, proposition_templates, propositions, usage_analytics, stripe_transactions)
- ✅ Tous les index pour les performances
- ✅ 3 fonctions (add_credits, debit_credits, update_analytics)
- ✅ 2 triggers (update_updated_at)
- ✅ Toutes les policies RLS (Row Level Security)

### Étape 3 : Configurer le Storage

1. Dans le dashboard Supabase, allez dans **Storage**
2. Créez les 3 buckets manuellement :
   - `templates` (privé)
   - `propositions` (privé)
   - `documents` (privé)

3. Ensuite, allez dans **SQL Editor**
4. Copiez tout le contenu de `storage.sql`
5. Collez-le dans l'éditeur SQL
6. Cliquez sur **Run** pour exécuter

Cela va créer toutes les policies de sécurité pour les buckets.

### Étape 4 : Configurer l'authentification

1. Dans le dashboard Supabase, allez dans **Authentication** > **Providers**
2. Activez **Email** provider
3. Configurez les paramètres :
   - ✅ Enable Email provider
   - ✅ Confirm email : Activé (recommandé)
   - ✅ Secure email change : Activé

### Étape 5 : Récupérer les clés API

1. Allez dans **Settings** > **API**
2. Copiez les valeurs suivantes dans votre `.env.local` :

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx...
SUPABASE_SERVICE_ROLE_KEY=eyJxxx...
```

⚠️ **IMPORTANT** : Ne partagez JAMAIS la `SUPABASE_SERVICE_ROLE_KEY` !

## 🔐 Row Level Security (RLS)

Les policies RLS sont automatiquement créées par le script `schema.sql`. Elles garantissent que :

- ✅ Les clients ne voient que leurs propres données
- ✅ Les admins ont accès à toutes les données
- ✅ Les utilisateurs ne peuvent pas modifier les données d'autres clients
- ✅ Les buckets Storage sont protégés

## 🧪 Tester la configuration

Pour vérifier que tout fonctionne :

1. Lancez votre application : `npm run dev`
2. Les clients Supabase devraient se connecter sans erreur
3. Vérifiez dans les logs du serveur qu'il n'y a pas d'erreur de connexion

## 📝 Créer un utilisateur admin (optionnel)

Pour créer un premier utilisateur admin, vous pouvez :

### Option 1 : Via le dashboard Supabase

1. Allez dans **Authentication** > **Users**
2. Cliquez sur **Add user**
3. Remplissez :
   - Email : `admin@example.com`
   - Password : `votre_mot_de_passe`
   - User Metadata : `{"role": "admin"}`

### Option 2 : Via SQL

```sql
-- Créer un utilisateur admin
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_user_meta_data,
  created_at,
  updated_at
)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'admin@example.com',
  crypt('votre_mot_de_passe', gen_salt('bf')),
  NOW(),
  '{"role": "admin"}'::jsonb,
  NOW(),
  NOW()
);
```

## 🔄 Mise à jour du schéma

Si vous devez modifier le schéma plus tard :

1. Modifiez les fichiers SQL
2. Exécutez les nouvelles migrations dans le SQL Editor
3. Testez en local avant de déployer en production

## 📊 Structure des tables

### organizations
Clients de la plateforme avec configuration IA et crédits.

### proposition_templates
Templates master uploadés par les clients.

### propositions
Propositions générées avec extraction IA et fichiers modifiés.

### usage_analytics
Métriques d'utilisation par client et par mois.

### stripe_transactions
Historique des paiements et recharges de crédits.

## 🆘 Dépannage

### Erreur : "relation already exists"
Les tables existent déjà. Vous pouvez :
- Ignorer l'erreur si c'est une réinstallation
- Ou supprimer les tables existantes avant de réexécuter

### Erreur : "permission denied"
Vérifiez que vous utilisez un compte avec les droits suffisants (postgres role).

### Erreur de connexion
Vérifiez que les variables d'environnement dans `.env.local` sont correctes.
