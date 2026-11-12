# Correctifs de sécurité — 11 novembre 2026

Les changements sont locaux. Aucune migration distante, aucun paiement, aucun appel IA et aucun déploiement n'ont été effectués. Les modifications présentes avant cette intervention sont conservées.

## Comportement corrigé

- Achat de crédits : montant JSON strictement numérique, fini, entre 10 et 10 000 euros, avec au plus deux décimales. Paiement et affichage des crédits utilisent ce montant canonique. Le bonus historique arrondi à l'euro est conservé. La recharge automatique réutilise cette validation.
- Webhook Stripe : vérifie identité de l'organisation, client, devise et paiement effectif; ignore `credits_total` comme autorité. Une RPC verrouille transaction et organisation puis inscrit statut et crédits dans une même transaction. Les rejeux et paiements déjà remboursés ne recréditent pas. Une erreur de règlement retourne 500 pour permettre la relivraison. L'annulation et l'expiration ne rétrogradent plus un paiement réussi.
- Upload de documents sources : vérifie la visibilité de la proposition avec le client utilisateur avant validation des fichiers, upload ou insertion privilégiée.
- Notes et entrées : migration rendant tenant, auteur et parent immuables pour les utilisateurs ordinaires; cohérence du tenant parent vérifiée, accès actuel au dossier requis. La synchronisation calendrier revalide le contexte de l'auteur, le secteur, la visibilité et l'organisation de la connexion.
- Secteurs : règles SQL restrictives pour catalogue, modèles et propositions, y compris les permissions de gestion. Les références Storage des modèles, sous-modèles, variantes et résultats générés suivent l'autorisation du parent; les gestionnaires ne peuvent pas modifier un objet modèle d'un secteur inaccessible.
- Mapping Word : rejette les segments réservés du prototype et ne traverse que les propriétés propres. Les permissions ne sont lues que depuis des booléens propres.
- Aperçu DOCX : document iframe sandbox sans scripts, formulaires, popups ou navigation de la page; CSP interne restrictive; liens passifs et altChunks désactivés. Les éditeurs de modèles doivent être autorisés à gérer les modèles. Parsing multipart et aperçu utilisent les limites taille/MIME; téléchargements des parseurs et aperçus bornés en flux et en temps.
- Callback Auth : redirection limitée aux chemins de même origine; destinations ambiguës avec double slash, antislash ou caractères de contrôle refusées.

## Assistant IA supprimé

Suppression des deux routes `/api/sp-questions/assist` et `/api/sp-questions/generate`, de leurs composants et de leurs boutons/modales. Suppression du réglage d'exemple `CLAUDE_MODEL_SUGGESTIONS`. Les questions SP restent éditables manuellement, importables, exportables et simulables. Les champs historiques du workflow restent compatibles avec les données enregistrées.

Les appels fournisseur restants se trouvent dans `lib/ai/claude.ts` et `lib/ai/deepseek.ts`; leurs consommateurs sont l'extraction de propositions et son outil de test administrateur. Le calcul déterministe SP reste conservé.

## Validation effectuée et limites

- Vérification TypeScript des sources, y compris les tests ajoutés : réussie avec `node node_modules/typescript/bin/tsc --project tmp/tsconfig.security.json --noEmit --incremental false`. La configuration temporaire exclut `.next`, dont les types générés référencent encore les deux routes supprimées; le prochain build devra les régénérer.
- `git diff --check` : réussi.
- Recherche statique : aucune référence restante aux composants/routes d'assistants supprimés ni au réglage `CLAUDE_MODEL_SUGGESTIONS`; appels fournisseur restants limités au pipeline d'extraction.
- Une fixture de test existante de génération SP utilisait un objet incomplet de composantes de loyer; elle reprend maintenant les valeurs par défaut existantes pour permettre la compilation.
- Mise à jour du 11 novembre : Docker Desktop a permis de créer un environnement isolé conforme. La fixture SQL complète `test/security/security-boundaries.sql` a été exécutée avec succès sur PostgreSQL 17 jetable, y compris la migration, sa réapplication, les notes/entrées, les secteurs, Storage, les permissions RPC, le règlement, son rejeu et le refus de montant/client incorrect sans écriture partielle.
- Le harnais `test/security/local-regression.cjs` a exécuté le code applicatif réel avec des doubles Stripe/Supabase : **8 groupes réussis, 0 échec**. Il couvre montant/bonus, mapping, permissions héritées, redirections, téléchargement borné, checkout, webhook et upload vers un parent inaccessible.
- Isolation utilisée : réseau Docker désactivé, aucun port exposé, environnement reconstruit avec valeurs non secrètes, sources/outils en lecture seule, utilisateur non privilégié, capacités supprimées et écritures limitées à un tmpfs scratch. Limites : 1 CPU, 384 Mio SQL / 768 Mio Node, 64 processus, 128 fichiers ouverts, fichiers 64 Mio SQL / 32 Mio Node, scratch 256 Mio SQL / 128 Mio Node, durée 110 s SQL / 100 s Node. PostgreSQL utilisait uniquement un socket Unix propre au conteneur. Les conteneurs et bases ont été supprimés après les vérifications.
- Aucun `.env.local`, credential, socket Docker ou dossier personnel n'a été exposé aux processus testés. Aucune connexion à Supabase, Stripe ou un fournisseur IA réel. Les erreurs webhook visibles dans la sortie correspondent aux cas négatifs simulés attendus.
- Le harnais Node dédié n'est pas la suite Vitest complète : les dépendances natives disponibles sont celles de Windows, et aucune dépendance Linux n'a été téléchargée ou installée. Le build complet et la validation navigateur restent à effectuer; les tests ciblés ne prouvent pas tous les parcours du projet.

## Vérification avant déploiement

Dans un environnement jetable conforme, sans clés réelles ni accès aux services externes :

1. Exécuter les tests unitaires et de routes avec les fournisseurs simulés. Cas ajoutés : type et arrondi monétaire, webhook payé/non payé/erreur/identité, refus d'upload sur parent inaccessible, chemins de mapping, permissions héritées, redirection et taille des téléchargements.
2. Sur une base PostgreSQL **vide et jetable**, exécuter `psql -v ON_ERROR_STOP=1 -f test/security/security-boundaries.sql`. La fixture crée ses rôles et données fictives, charge les migrations et vérifie secteurs, notes/entrées, accès RPC, crédits et rejeu. Ne pas utiliser la base de `.env.local`.
3. Vérifier l'aperçu DOCX dans un navigateur isolé, ainsi que les parcours Word/Excel et calendriers avec adaptateurs simulés.
4. Régénérer les types Next et effectuer le build du projet.

## Migration à appliquer avec la release

`supabase/migrations/2026-11-11_security_boundaries.sql` doit être appliquée **après les migrations du 9 et 10 novembre**, et avant la mise en service du nouveau webhook, qui dépend de `settle_credit_checkout`.

La migration est transactionnelle et réapplicable. Le nouvel index unique refuse les éventuels doublons historiques de `stripe_session_id` sans supprimer de transactions. Si un contrôle préalable révèle des doublons, les réconcilier avant l'application; ne pas effacer des paiements pour forcer la migration. Elle n'effectue aucun recalcul rétroactif de soldes déjà crédités.

Les soldes et transactions historiques peuvent nécessiter une réconciliation par le propriétaire si le comportement de montant textuel a été utilisé. Cette vérification financière n'a pas été effectuée dans la base réelle.

Après validation sur environnement jetable, appliquer la migration et déployer la release ensemble. Ne pas relancer ensuite une ancienne migration de durcissement isolément : elle pourrait restaurer des définitions de fonctions antérieures.
