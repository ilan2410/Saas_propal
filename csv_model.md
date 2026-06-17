# Guide d'importation des produits - Catalogue PropoBoost

## Champs obligatoires

| Champ | Description | Format |
|---|---|---|
| `nom` | Nom du produit | Texte |

## Champs optionnels

| Champ | Description | Format / Valeurs |
|---|---|---|
| `categorie` | Catégorie du produit | `mobile`, `internet`, `fixe`, `cloud`, `equipement`, `cadeau`, `installation` ou `autre` *(défaut : autre)* |
| `description` | Description du produit | Texte libre |
| `fournisseur` | Nom du fournisseur | Texte |
| `type_frequence` | Type de tarification | `mensuel` ou `unique` *(défaut : mensuel)* |
| `prix_mensuel` | Prix mensuel (si type = mensuel) | Nombre (ex: `29.99` ou `29,99`) |
| `prix_vente` | Prix de vente unique (si type = unique) | Nombre |
| `prix_installation` | Frais d'installation | Nombre |
| `engagement_mois` | Durée d'engagement en mois | Entier |
| `image_url` | URL de l'image | Texte (URL complète) |
| `tags` | Tags séparés par des virgules | Ex: `tag1, tag2, tag3` |
| `mode_fas` | Mode frais d'accès & service | `fixe_par_selection` ou `multiplie_par_quantite` *(défaut : fixe_par_selection)* |
| `remise_type` | Type de remise | `fixe` ou `pourcentage` |
| `remise_valeur` | Montant ou % de la remise | Nombre |
| `actif` | Produit actif ? | `oui` / `non` / `true` / `false` / `1` / `0` *(défaut : oui)* |
| `destinations_proposition` | Visible dans Proposition ? | `oui` / `non` *(défaut : oui)* |
| `destinations_bdc_operateur` | Visible dans BDC Opérateur ? | `oui` / `non` *(défaut : oui)* |
| `destinations_bdc_materiel` | Visible dans BDC Matériel ? | `oui` / `non` *(défaut : oui)* |

## Règles importantes

- **Détection des doublons** : un produit est considéré comme doublon si le trio `nom + fournisseur + tarif` est identique. Le tarif comparé est `prix_mensuel` si `type_frequence = mensuel`, sinon `prix_vente`.
- **Mode "Ajouter seulement"** : les doublons sont ignorés (compteur "ignorés" affiché).
- **Mode "Ajouter + Mettre à jour"** : les doublons sont remplacés entièrement par les données du fichier (compteur "mis à jour").
- Les noms de colonnes dans ton fichier peuvent être différents — l'importateur te proposera un mapping automatique que tu pourras corriger avant validation.
