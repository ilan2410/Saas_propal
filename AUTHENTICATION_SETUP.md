# 🔐 Système d'authentification - Configuration complète

## ✅ Fichiers créés

### 1. Page de login
- `app/login/page.tsx` - Interface de connexion

### 2. Composants d'authentification
- `components/auth/SignOutButton.tsx` - Bouton de déconnexion

### 3. API Routes
- `app/api/auth/signout/route.ts` - Endpoint de déconnexion

### 4. Middleware réactivé
- `middleware.ts` - Protection des routes

### 5. Layout admin mis à jour
- `app/admin/layout.tsx` - Avec vérification authentification

---

## 🎯 Fonctionnement

### Flux d'authentification

1. **Utilisateur non connecté** :
   - Accès à `/` → OK
   - Accès à `/login` → OK
   - Accès à `/admin/*` → Redirection vers `/login`
   - Accès à `/dashboard` → Redirection vers `/login`

2. **Utilisateur connecté (client)** :
   - Accès à `/dashboard` → OK
   - Accès à `/templates` → OK
   - Accès à `/propositions` → OK
   - Accès à `/admin/*` → Redirection vers `/dashboard`

3. **Utilisateur connecté (admin)** :
   - Accès à `/admin/*` → OK
   - Accès à toutes les routes → OK

### Protection des routes

Le middleware vérifie :
- ✅ Si l'utilisateur est authentifié
- ✅ Si l'utilisateur a le bon rôle (admin vs client)
- ✅ Redirection automatique vers `/login` si non authentifié

---

## 🧪 Test de l'authentification

### Étape 1 : Créer un utilisateur admin

Dans Supabase, tu dois avoir un utilisateur avec :
```json
{
  "role": "admin"
}
```
dans les `user_metadata`.

### Étape 2 : Tester la connexion

1. Va sur **http://localhost:3000/login**
2. Entre l'email et le mot de passe de ton admin
3. Clique sur "Se connecter"
4. Tu devrais être redirigé vers `/admin/dashboard`

### Étape 3 : Tester la protection

1. Déconnecte-toi
2. Essaie d'accéder à **http://localhost:3000/admin/dashboard**
3. Tu devrais être redirigé vers `/login`

### Étape 4 : Tester la déconnexion

1. Connecte-toi
2. Clique sur le bouton "Déconnexion" dans la sidebar
3. Tu devrais être redirigé vers `/login`

---

## 🔑 Créer un utilisateur admin

### Option 1 : Via le dashboard Supabase

1. Va dans **Authentication** > **Users**
2. Clique sur ton utilisateur
3. Édite les **User Metadata**
4. Ajoute :
```json
{
  "role": "admin"
}
```

### Option 2 : Via SQL

```sql
UPDATE auth.users
SET raw_user_meta_data = jsonb_set(
  COALESCE(raw_user_meta_data, '{}'::jsonb),
  '{role}',
  '"admin"'::jsonb
)
WHERE email = 'admin@example.com';
```

---

## 🛡️ Sécurité implémentée

### Middleware
- ✅ Vérification authentification sur toutes les routes protégées
- ✅ Vérification du rôle admin pour `/admin/*`
- ✅ Rafraîchissement automatique de la session
- ✅ Gestion des cookies Supabase

### Layout Admin
- ✅ Vérification authentification côté serveur
- ✅ Vérification du rôle admin
- ✅ Redirection automatique si non autorisé
- ✅ Affichage de l'email de l'utilisateur

### Page de login
- ✅ Validation des champs
- ✅ Gestion des erreurs
- ✅ Loading state
- ✅ Redirection automatique selon le rôle

---

## 📋 Routes disponibles

### Routes publiques
- `/` - Page d'accueil
- `/login` - Page de connexion

### Routes admin (rôle "admin" requis)
- `/admin/dashboard` - Dashboard admin
- `/admin/clients` - Liste des clients
- `/admin/clients/new` - Créer un client
- `/admin/clients/[id]` - Détails d'un client
- `/admin/analytics` - Analytics (à créer)

### Routes client (authentification requise)
- `/dashboard` - Dashboard client (à créer)
- `/templates` - Templates (à créer)
- `/propositions` - Propositions (à créer)
- `/credits` - Crédits (à créer)
- `/settings` - Paramètres (à créer)

---

## ⚠️ Points importants

1. **User Metadata** : Le rôle est stocké dans `user_metadata.role`
2. **Cookies** : Supabase utilise des cookies pour la session
3. **Middleware** : Exécuté sur chaque requête (sauf API et static)
4. **Server Components** : Le layout admin est un Server Component
5. **Client Components** : Login et SignOut sont des Client Components

---

## 🔄 Prochaines étapes

Pour compléter le système d'authentification :

1. **Page d'inscription** (si nécessaire)
2. **Réinitialisation de mot de passe**
3. **Vérification d'email**
4. **Page 403 (Accès refusé)**
5. **Page 404 personnalisée**

---

## 🆘 Dépannage

### Erreur : "Invalid supabaseUrl"
- Vérifie que les variables d'environnement sont correctes dans `.env.local`
- Redémarre le serveur après modification

### Redirection infinie
- Vérifie que `/login` est bien dans les routes publiques du middleware
- Vérifie que l'utilisateur a bien le rôle "admin" dans les metadata

### Session expirée
- Supabase rafraîchit automatiquement la session
- Si problème, déconnecte-toi et reconnecte-toi

---

**L'authentification complète est maintenant active !** 🔐
