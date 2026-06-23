# Référence complète des variables SP pour Word (Docxtemplater)

> **Objectif** : Ce document rassemble **toutes les variables SP hardcodées** disponibles pour l'injection dans les modèles Word via Docxtemplater. Copiez-collez les syntaxes ci-dessous directement dans vos documents Word pour tester leur fonctionnement.

---

## 1. Variables simples (texte / nombre)

Ces variables s'utilisent avec la syntaxe simple `{{nom_variable}}`.

### 1.1 Économies & totaux principaux

| Variable | Description | Syntaxe Docxtemplater |
|----------|-------------|----------------------|
| `sp_economie_mensuelle` | Économie mensuelle totale (HT) | `{{sp_economie_mensuelle}}` |
| `sp_economie_annuelle` | Économie annuelle totale (HT) | `{{sp_economie_annuelle}}` |
| `sp_total_actuel` | Total mensuel de la situation actuelle (HT) | `{{sp_total_actuel}}` |
| `sp_total_propose` | Total mensuel de la solution proposée (HT) | `{{sp_total_propose}}` |
| `sp_ameliorations` | Liste des améliorations apportées (texte) | `{{sp_ameliorations}}` |
| `sp_fournisseur_propose` | Nom du fournisseur proposé | `{{sp_fournisseur_propose}}` |
| `sp_nb_lignes` | Nombre total de lignes | `{{sp_nb_lignes}}` |
| `sp_est_economie` | Indicateur si c'est une économie (Oui/Non) | `{{sp_est_economie}}` |

### 1.2 Adresses

| Variable | Description | Syntaxe Docxtemplater |
|----------|-------------|----------------------|
| `sp_adresse_facturation` | Adresse de facturation complète (formatée) | `{{sp_adresse_facturation}}` |
| `sp_adresse_facturation_rue` | Rue de l'adresse de facturation | `{{sp_adresse_facturation_rue}}` |
| `sp_adresse_facturation_cp` | Code postal de facturation | `{{sp_adresse_facturation_cp}}` |
| `sp_adresse_facturation_ville` | Ville de facturation | `{{sp_adresse_facturation_ville}}` |
| `sp_adresse_livraison` | Adresse de livraison complète (formatée) | `{{sp_adresse_livraison}}` |
| `sp_adresse_livraison_rue` | Rue de l'adresse de livraison | `{{sp_adresse_livraison_rue}}` |
| `sp_adresse_livraison_cp` | Code postal de livraison | `{{sp_adresse_livraison_cp}}` |
| `sp_adresse_livraison_ville` | Ville de livraison | `{{sp_adresse_livraison_ville}}` |
| `sp_livraison_identique` | Livraison identique à facturation (Oui/Non) | `{{sp_livraison_identique}}` |

### 1.3 Récurrent / Ponctuel

| Variable | Description | Syntaxe Docxtemplater |
|----------|-------------|----------------------|
| `sp_total_recurrent` | Total des charges récurrentes mensuelles (HT) | `{{sp_total_recurrent}}` |
| `sp_total_ponctuel` | Total des charges ponctuelles (HT) | `{{sp_total_ponctuel}}` |
| `sp_total_indemnites` | Total des indemnités de résiliation (HT) | `{{sp_total_indemnites}}` |
| `sp_remise_mois_offert` | Montant de la remise "mois offert" (HT) | `{{sp_remise_mois_offert}}` |
| `sp_total_remise` | Montant total des remises produits mensuelles (HT) | `{{sp_total_remise}}` |
| `sp_remise_fixe` | Total des remises sur les lignes fixes (HT) | `{{sp_remise_fixe}}` |
| `sp_remise_mobile` | Total des remises sur les lignes mobiles (HT) | `{{sp_remise_mobile}}` |
| `sp_remise_abonnement` | Total des remises abonnement = fixe + mobile (HT) | `{{sp_remise_abonnement}}` |
| `sp_remise_internet` | Total des remises sur les offres internet (HT) | `{{sp_remise_internet}}` |
| `sp_total_installation` | Total des frais d'installation (HT) | `{{sp_total_installation}}` |
| `sp_total_materiel_achat` | Total du matériel en achat (HT) | `{{sp_total_materiel_achat}}` |
| `sp_fas_total` | Total des frais d'accès au service (FAS) (HT) | `{{sp_fas_total}}` |

### 1.4 Loyer / Marge

| Variable | Description | Syntaxe Docxtemplater |
|----------|-------------|----------------------|
| `sp_loyer_mensuel` | Loyer mensuel calculé (HT) | `{{sp_loyer_mensuel}}` |
| `sp_loyer_trimestriel` | Loyer trimestriel calculé (HT) | `{{sp_loyer_trimestriel}}` |
| `sp_marge` | Marge suggérée (montant ou pourcentage) | `{{sp_marge}}` |
| `sp_duree_mois` | Durée du contrat en mois | `{{sp_duree_mois}}` |
| `sp_trimestres` | Nombre de trimestres | `{{sp_trimestres}}` |
| `sp_mois_offerts` | Nombre de mois offerts | `{{sp_mois_offerts}}` |

### 1.5 Totaux Lot 4 (tableaux filtrés)

| Variable | Description | Syntaxe Docxtemplater |
|----------|-------------|----------------------|
| `sp_total_forfaits_mensuel_ht` | Total mensuel des forfaits (HT) | `{{sp_total_forfaits_mensuel_ht}}` |
| `sp_total_materiel_ht` | Total du matériel (HT) | `{{sp_total_materiel_ht}}` |
| `sp_total_bdc_operateur_ht` | Total BDC opérateur (HT) | `{{sp_total_bdc_operateur_ht}}` |
| `sp_total_bdc_internet_ht` | Total BDC internet (HT) | `{{sp_total_bdc_internet_ht}}` |
| `sp_total_bdc_materiel_ht` | Total BDC matériel (HT) | `{{sp_total_bdc_materiel_ht}}` |
| `sp_total_cadeaux_ht` | Total des cadeaux (HT) | `{{sp_total_cadeaux_ht}}` |
| `sp_total_complet` | Total complet de la proposition (HT) | `{{sp_total_complet}}` |

### 1.6 Autres variables simples

| Variable | Description | Syntaxe Docxtemplater |
|----------|-------------|----------------------|
| `sp_date_limite_souscription` | Date limite de souscription | `{{sp_date_limite_souscription}}` |
| `sp_duree_trimestres` | Durée en trimestres (texte) | `{{sp_duree_trimestres}}` |

---

## 2. Variables tableaux (boucles Docxtemplater)

Ces variables sont des **tableaux** (listes de lignes). En Word, elles s'utilisent avec une **boucle** :

```
{{#nom_tableau}}
  Contenu de la ligne avec {{champ_interne}}
{{/nom_tableau}}
```

> **Important** : Les champs internes (ex: `sp_nom_ligne`) ne fonctionnent **que à l'intérieur** de leur boucle respective.

---

### 2.1 Lignes mobiles (`sp_lignes_mobiles`)

**Syntaxe boucle :**
```
{{#sp_lignes_mobiles}}
{{sp_nom_ligne}}  {{sp_numero}}  {{sp_quantite}}  {{sp_produit}}  {{sp_prix_actuel}}  {{sp_prix_propose}}  {{sp_economie}}  {{sp_analyse}}
{{/sp_lignes_mobiles}}
```
> **Explication** : Ce tableau liste toutes les lignes mobiles de la proposition proposée. Chaque ligne contient le nom de la ligne, le produit/forfait choisi, le prix actuel, le prix proposé, l'économie réalisée et une analyse. Les champs `sp_produit_id`, `sp_produit_fournisseur`, `sp_justification` et `sp_type_ligne` sont aussi disponibles si besoin.

**Champs internes disponibles dans la boucle :**

| Champ interne | Description | Syntaxe |
|---------------|-------------|---------|
| `sp_nom_ligne` | Nom / numéro de la ligne | `{{sp_nom_ligne}}` |
| `sp_numero` | Numéro de téléphone / ligne lié au forfait (si disponible) | `{{sp_numero}}` |
| `sp_quantite` | Quantité choisie pour le produit / forfait (si disponible) | `{{sp_quantite}}` |
| `sp_produit` | Nom du produit / forfait | `{{sp_produit}}` |
| `sp_produit_id` | ID du produit dans le catalogue | `{{sp_produit_id}}` |
| `sp_produit_fournisseur` | Fournisseur du produit | `{{sp_produit_fournisseur}}` |
| `sp_prix_actuel` | Prix actuel (texte formaté) | `{{sp_prix_actuel}}` |
| `sp_prix_propose` | Prix proposé (texte formaté) | `{{sp_prix_propose}}` |
| `sp_economie` | Économie réalisée (texte formaté) | `{{sp_economie}}` |
| `sp_analyse` | Analyse / commentaire | `{{sp_analyse}}` |
| `sp_justification` | Justification du choix | `{{sp_justification}}` |
| `sp_type_ligne` | Type de ligne (toujours "Mobile") | `{{sp_type_ligne}}` |

---

### 2.2 Lignes fixes (`sp_lignes_fixes`)

**Syntaxe boucle :**
```
{{#sp_lignes_fixes}}
{{sp_nom_ligne}}  {{sp_numero}}  {{sp_quantite}}  {{sp_produit}}  {{sp_prix_actuel}}  {{sp_prix_propose}}  {{sp_economie}}  {{sp_analyse}}
{{/sp_lignes_fixes}}
```
> **Explication** : Ce tableau liste toutes les lignes fixes de la proposition. Même structure que les lignes mobiles.

**Champs internes disponibles dans la boucle :**

| Champ interne | Description | Syntaxe |
|---------------|-------------|---------|
| `sp_nom_ligne` | Nom / numéro de la ligne | `{{sp_nom_ligne}}` |
| `sp_numero` | Numéro de téléphone / ligne lié au forfait (si disponible) | `{{sp_numero}}` |
| `sp_quantite` | Quantité choisie pour le produit / forfait (si disponible) | `{{sp_quantite}}` |
| `sp_produit` | Nom du produit / forfait | `{{sp_produit}}` |
| `sp_produit_id` | ID du produit dans le catalogue | `{{sp_produit_id}}` |
| `sp_produit_fournisseur` | Fournisseur du produit | `{{sp_produit_fournisseur}}` |
| `sp_prix_actuel` | Prix actuel (texte formaté) | `{{sp_prix_actuel}}` |
| `sp_prix_propose` | Prix proposé (texte formaté) | `{{sp_prix_propose}}` |
| `sp_economie` | Économie réalisée (texte formaté) | `{{sp_economie}}` |
| `sp_analyse` | Analyse / commentaire | `{{sp_analyse}}` |
| `sp_justification` | Justification du choix | `{{sp_justification}}` |
| `sp_type_ligne` | Type de ligne (toujours "Fixe") | `{{sp_type_ligne}}` |

---

### 2.3 Internet (`sp_internet`)

**Syntaxe boucle :**
```
{{#sp_internet}}
{{sp_nom_ligne}}  {{sp_numero}}  {{sp_quantite}}  {{sp_produit}}  {{sp_prix_actuel}}  {{sp_prix_propose}}  {{sp_economie}}  {{sp_analyse}}
{{/sp_internet}}
```
> **Explication** : Ce tableau liste toutes les offres internet (ADSL, fibre, 4G/5G box) de la proposition proposée.

**Champs internes disponibles dans la boucle :**

| Champ interne | Description | Syntaxe |
|---------------|-------------|---------|
| `sp_nom_ligne` | Nom de l'offre internet | `{{sp_nom_ligne}}` |
| `sp_numero` | Numéro de téléphone / ligne lié au forfait (si disponible) | `{{sp_numero}}` |
| `sp_quantite` | Quantité choisie pour le produit / forfait (si disponible) | `{{sp_quantite}}` |
| `sp_produit` | Nom du produit / offre | `{{sp_produit}}` |
| `sp_produit_id` | ID du produit dans le catalogue | `{{sp_produit_id}}` |
| `sp_produit_fournisseur` | Fournisseur du produit | `{{sp_produit_fournisseur}}` |
| `sp_prix_actuel` | Prix actuel (texte formaté) | `{{sp_prix_actuel}}` |
| `sp_prix_propose` | Prix proposé (texte formaté) | `{{sp_prix_propose}}` |
| `sp_economie` | Économie réalisée (texte formaté) | `{{sp_economie}}` |
| `sp_analyse` | Analyse / commentaire | `{{sp_analyse}}` |
| `sp_justification` | Justification du choix | `{{sp_justification}}` |
| `sp_type_ligne` | Type de ligne (toujours "Internet") | `{{sp_type_ligne}}` |

---

### 2.4 Matériel (`sp_materiel`)

**Syntaxe boucle :**
```
{{#sp_materiel}}
{{sp_materiel_nom}}  {{sp_materiel_ref}}  {{sp_materiel_prix_mensuel}}  {{sp_materiel_duree_engagement}}  {{sp_materiel_commentaire}}
{{/sp_materiel}}
```
> **Explication** : Ce tableau liste le matériel proposé (téléphones, équipements) avec son nom, référence, prix mensuel, durée d'engagement et commentaire.

**Champs internes disponibles dans la boucle :**

| Champ interne | Description | Syntaxe |
|---------------|-------------|---------|
| `sp_materiel_nom` | Nom du matériel | `{{sp_materiel_nom}}` |
| `sp_materiel_ref` | Référence du matériel | `{{sp_materiel_ref}}` |
| `sp_materiel_prix_mensuel` | Prix mensuel (texte formaté) | `{{sp_materiel_prix_mensuel}}` |
| `sp_materiel_duree_engagement` | Durée d'engagement | `{{sp_materiel_duree_engagement}}` |
| `sp_materiel_commentaire` | Commentaire sur le matériel | `{{sp_materiel_commentaire}}` |
| `sp_materiel_produit_id` | ID du produit dans le catalogue | `{{sp_materiel_produit_id}}` |
| `sp_materiel_fournisseur` | Fournisseur du matériel | `{{sp_materiel_fournisseur}}` |
| `sp_type_ligne` | Type de ligne (toujours "Materiel") | `{{sp_type_ligne}}` |

---

### 2.5 Tableaux fusionnés (pré-construits)

Ces tableaux agrègent automatiquement plusieurs catégories.

#### `sp_fixes_mobiles` — Fusion : Mobiles + Fixes

**Syntaxe boucle :**
```
{{#sp_fixes_mobiles}}
{{sp_nom_ligne}}  {{sp_produit}}  {{sp_prix_actuel}}  {{sp_prix_propose}}  {{sp_economie}}  {{sp_analyse}}
{{/sp_fixes_mobiles}}
```
> **Explication** : Tableau fusionné qui regroupe automatiquement les lignes mobiles et les lignes fixes dans un seul tableau.

**Champs internes :** `sp_nom_ligne`, `sp_numero`, `sp_quantite`, `sp_produit`, `sp_produit_id`, `sp_produit_fournisseur`, `sp_prix_actuel`, `sp_prix_propose`, `sp_economie`, `sp_analyse`, `sp_justification`, `sp_type_ligne`

---

#### `sp_fixes_mobiles_internet` — Fusion : Mobiles + Fixes + Internet

**Syntaxe boucle :**
```
{{#sp_fixes_mobiles_internet}}
{{sp_nom_ligne}}  {{sp_numero}}  {{sp_quantite}}  {{sp_produit}}  {{sp_prix_actuel}}  {{sp_prix_propose}}  {{sp_economie}}  {{sp_analyse}}
{{/sp_fixes_mobiles_internet}}
```
> **Explication** : Tableau fusionné qui regroupe les lignes mobiles, fixes et les offres internet dans un seul tableau.

**Champs internes :** `sp_nom_ligne`, `sp_numero`, `sp_quantite`, `sp_produit`, `sp_produit_id`, `sp_produit_fournisseur`, `sp_prix_actuel`, `sp_prix_propose`, `sp_economie`, `sp_analyse`, `sp_justification`, `sp_type_ligne`

---

#### `sp_toutes_lignes` — Fusion : Mobiles + Fixes + Internet

**Syntaxe boucle :**
```
{{#sp_toutes_lignes}}
{{sp_nom_ligne}}  {{sp_numero}}  {{sp_produit}}  {{sp_prix_actuel}}  {{sp_prix_propose}}  {{sp_economie}}  {{sp_analyse}}
{{/sp_toutes_lignes}}
```
> **Explication** : Tableau fusionné contenant toutes les lignes (mobiles + fixes + internet). Identique à `sp_fixes_mobiles_internet`.

**Champs internes :** `sp_nom_ligne`, `sp_numero`, `sp_produit`, `sp_produit_id`, `sp_produit_fournisseur`, `sp_prix_actuel`, `sp_prix_propose`, `sp_economie`, `sp_analyse`, `sp_justification`, `sp_type_ligne`

---

#### `sp_tout` — Fusion : Mobiles + Fixes + Internet + Materiel

**Syntaxe boucle :**
```
{{#sp_tout}}
{{sp_nom_ligne}}  {{sp_produit}}  {{sp_prix_actuel}}  {{sp_prix_propose}}  {{sp_economie}}  {{sp_analyse}}
{{/sp_tout}}
```
> **Explication** : Tableau fusionné global contenant toutes les catégories : lignes mobiles, fixes, internet ET matériel. Pour les lignes matériel, utilisez `sp_materiel_nom`, `sp_materiel_ref`, etc.

**Champs internes :** `sp_nom_ligne`, `sp_numero`, `sp_quantite`, `sp_produit`, `sp_produit_id`, `sp_produit_fournisseur`, `sp_prix_actuel`, `sp_prix_propose`, `sp_economie`, `sp_analyse`, `sp_justification`, `sp_type_ligne` (pour les lignes standards) ; `sp_materiel_nom`, `sp_materiel_ref`, etc. (pour les lignes matériel)

---

### 2.6 Situation proposée complète (`sp_situation_proposee_complet`)

**Syntaxe boucle :**
```
{{#sp_situation_proposee_complet}}
{{sp_sp_type}}  {{sp_sp_produit}}  {{sp_sp_numero}}  {{sp_sp_quantite}}  {{sp_sp_fournisseur}}  {{sp_sp_prix_propose}}  {{sp_sp_analyse}}
{{/sp_situation_proposee_complet}}
```
> **Explication** : Situation proposée complète : liste toutes les lignes de la solution proposée (mobiles, fixes, internet, matériel). Pour un rendu 100% SP, utilisez en priorité `sp_sp_produit` et `sp_sp_prix_propose`.

**Champs internes disponibles dans la boucle :**

| Champ interne | Description | Syntaxe |
|---------------|-------------|---------|
| `sp_sp_type` | Type de ligne (Mobile/Fixe/Internet/Materiel) | `{{sp_sp_type}}` |
| `sp_sp_nom` | Nom de la ligne actuelle / offre de rattachement (peut refléter la SA) | `{{sp_sp_nom}}` |
| `sp_sp_numero` | Numéro de téléphone / ligne lié au forfait, nettoyé quand détectable | `{{sp_sp_numero}}` |
| `sp_sp_quantite` | Quantité choisie pour le produit / forfait (si disponible) | `{{sp_sp_quantite}}` |
| `sp_sp_produit` | Nom du produit proposé (recommandé pour la désignation SP) | `{{sp_sp_produit}}` |
| `sp_sp_fournisseur` | Fournisseur | `{{sp_sp_fournisseur}}` |
| `sp_sp_prix_actuel` | Prix actuel SA (texte formaté, optionnel) | `{{sp_sp_prix_actuel}}` |
| `sp_sp_prix_propose` | Prix proposé SP (texte formaté, recommandé) | `{{sp_sp_prix_propose}}` |
| `sp_sp_economie` | Économie (texte formaté, optionnel) | `{{sp_sp_economie}}` |
| `sp_sp_analyse` | Analyse (optionnel) | `{{sp_sp_analyse}}` |

---

### 2.7 Situation proposée forfaits (`sp_situation_proposee_forfaits`)

**Syntaxe boucle :**
```
{{#sp_situation_proposee_forfaits}}
{{sp_sp_type}}  {{sp_sp_produit}}  {{sp_sp_numero}}  {{sp_sp_quantite}}  {{sp_sp_fournisseur}}  {{sp_sp_prix_propose}}  {{sp_sp_analyse}}
{{/sp_situation_proposee_forfaits}}
```
> **Explication** : Situation proposée limitée aux forfaits uniquement (exclut le matériel). Pour un tableau 100% SP, utilisez en priorité `sp_sp_produit` et `sp_sp_prix_propose`.

**Champs internes :** Identiques à `sp_situation_proposee_complet` (`sp_sp_type`, `sp_sp_nom`, `sp_sp_numero`, `sp_sp_quantite`, `sp_sp_produit`, `sp_sp_fournisseur`, `sp_sp_prix_actuel`, `sp_sp_prix_propose`, `sp_sp_economie`, `sp_sp_analyse`)

---

### 2.8 Situation proposée forfaits sans remise (`sp_situation_proposee_forfaits_sans_remise`)

**Syntaxe boucle :**
```
{{#sp_situation_proposee_forfaits_sans_remise}}
{{sp_sp_type}}  {{sp_sp_produit}}  {{sp_sp_numero}}  {{sp_sp_quantite}}  {{sp_sp_fournisseur}}  {{sp_sp_prix_propose}}  {{sp_sp_analyse}}
{{/sp_situation_proposee_forfaits_sans_remise}}
```
> **Explication** : Reprend les forfaits proposés avec les tarifs catalogue avant remise. Si au moins un forfait est remisé, une dernière ligne `Remise` est ajoutée automatiquement avec le montant total de la remise dans `sp_sp_prix_propose`.

**Champs internes :** Identiques à `sp_situation_proposee_complet` (`sp_sp_type`, `sp_sp_nom`, `sp_sp_numero`, `sp_sp_quantite`, `sp_sp_produit`, `sp_sp_fournisseur`, `sp_sp_prix_actuel`, `sp_sp_prix_propose`, `sp_sp_economie`, `sp_sp_analyse`)

---

### 2.9 Matériel détaillé (`sp_materiel_detail`)

**Syntaxe boucle :**
```
{{#sp_materiel_detail}}
{{%sp_matd_image_url}}
{{sp_matd_nom}}  {{sp_matd_ref}}  {{sp_matd_fournisseur}}  {{sp_matd_quantite}}  {{sp_matd_prix_ht}}  {{sp_matd_frequence}}  {{sp_matd_description}}
{{/sp_materiel_detail}}
```
> **Explication** : Détail du matériel avec nom, référence, fournisseur, quantité, prix unitaire HT, fréquence (Mensuel ou Unique) et description issue de la fiche produit. Si vous utilisez l'image, placez `{{%sp_matd_image_url}}` seul dans son paragraphe ou sa cellule Word. Dans un tableau Word, ne mettez pas `{{#sp_materiel_detail}}` dans la cellule de l'image ni `{{/sp_materiel_detail}}` dans une autre cellule de la meme ligne, car cette structure peut casser le module image Docxtemplater.

**Champs internes disponibles dans la boucle :**

| Champ interne | Description | Syntaxe |
|---------------|-------------|---------|
| `sp_matd_nom` | Nom du matériel | `{{sp_matd_nom}}` |
| `sp_matd_ref` | Référence du matériel | `{{sp_matd_ref}}` |
| `sp_matd_fournisseur` | Fournisseur | `{{sp_matd_fournisseur}}` |
| `sp_matd_quantite` | Quantité | `{{sp_matd_quantite}}` |
| `sp_matd_prix_ht` | Prix unitaire HT (texte formaté) | `{{sp_matd_prix_ht}}` |
| `sp_matd_description` | Description de la fiche produit | `{{sp_matd_description}}` |
| `sp_matd_frequence` | Fréquence (Mensuel / Unique) | `{{sp_matd_frequence}}` |
| `sp_matd_image_url` | URL de l'image du produit | `{{sp_matd_image_url}}` |

---

### 2.9 BDC Opérateur (`sp_bdc_operateur_table`)

**Syntaxe boucle :**
```
{{#sp_bdc_operateur_table}}
{{sp_bdc_op_type}}  {{sp_bdc_op_nom}}  {{sp_bdc_op_produit}}  {{sp_bdc_op_fournisseur}}  {{sp_bdc_op_quantite}}  {{sp_bdc_op_prix_mensuel_ht}}  {{sp_bdc_op_prix_mensuel_ht_sans_remise}}  {{sp_bdc_op_prix_actuel}}  {{sp_bdc_op_economie}}
{{/sp_bdc_operateur_table}}
```
> **Explication** : Tableau BDC (Bon De Commande) opérateur : liste les lignes mobiles et fixes pour le bon de commande avec type, nom, produit, fournisseur, prix mensuel HT, prix actuel et économie.

**Champs internes disponibles dans la boucle :**

| Champ interne | Description | Syntaxe |
|---------------|-------------|---------|
| `sp_bdc_op_type` | Type de ligne (Mobile/Fixe) | `{{sp_bdc_op_type}}` |
| `sp_bdc_op_nom` | Nom de la ligne / offre | `{{sp_bdc_op_nom}}` |
| `sp_bdc_op_produit` | Nom du produit | `{{sp_bdc_op_produit}}` |
| `sp_bdc_op_fournisseur` | Fournisseur | `{{sp_bdc_op_fournisseur}}` |
| `sp_bdc_op_quantite` | Quantité | `{{sp_bdc_op_quantite}}` |
| `sp_bdc_op_prix_mensuel_ht` | Prix mensuel HT remisé (texte formaté) | `{{sp_bdc_op_prix_mensuel_ht}}` |
| `sp_bdc_op_prix_mensuel_ht_sans_remise` | Prix mensuel HT avant remise (texte formaté) | `{{sp_bdc_op_prix_mensuel_ht_sans_remise}}` |
| `sp_bdc_op_prix_actuel` | Prix actuel (texte formaté, optionnel) | `{{sp_bdc_op_prix_actuel}}` |
| `sp_bdc_op_economie` | Économie (texte formaté, optionnel) | `{{sp_bdc_op_economie}}` |

---

### 2.10 BDC Internet (`sp_bdc_internet_table`)

**Syntaxe boucle :**
```
{{#sp_bdc_internet_table}}
{{sp_bdc_int_nom}}  {{sp_bdc_int_produit}}  {{sp_bdc_int_fournisseur}}  {{sp_bdc_int_quantite}}  {{sp_bdc_int_prix_mensuel_ht}}  {{sp_bdc_int_prix_mensuel_ht_sans_remise}}  {{sp_bdc_int_prix_actuel}}
{{/sp_bdc_internet_table}}
```
> **Explication** : Tableau BDC internet : liste les offres internet pour le bon de commande avec nom, produit, fournisseur, prix mensuel HT et prix actuel.

**Champs internes disponibles dans la boucle :**

| Champ interne | Description | Syntaxe |
|---------------|-------------|---------|
| `sp_bdc_int_nom` | Nom de l'offre internet | `{{sp_bdc_int_nom}}` |
| `sp_bdc_int_produit` | Nom du produit | `{{sp_bdc_int_produit}}` |
| `sp_bdc_int_fournisseur` | Fournisseur | `{{sp_bdc_int_fournisseur}}` |
| `sp_bdc_int_quantite` | Quantité | `{{sp_bdc_int_quantite}}` |
| `sp_bdc_int_prix_mensuel_ht` | Prix mensuel HT remisé (texte formaté) | `{{sp_bdc_int_prix_mensuel_ht}}` |
| `sp_bdc_int_prix_mensuel_ht_sans_remise` | Prix mensuel HT avant remise (texte formaté) | `{{sp_bdc_int_prix_mensuel_ht_sans_remise}}` |
| `sp_bdc_int_prix_actuel` | Prix actuel (texte formaté, optionnel) | `{{sp_bdc_int_prix_actuel}}` |

---

### 2.11 BDC Matériel (`sp_bdc_materiel_table`)

**Syntaxe boucle :**
```
{{#sp_bdc_materiel_table}}
{{sp_bdc_mat_nom}}  {{sp_bdc_mat_ref}}  {{sp_bdc_mat_fournisseur}}  {{sp_bdc_mat_quantite}}  {{sp_bdc_mat_prix_ht}}  {{sp_bdc_mat_frequence}}
{{/sp_bdc_materiel_table}}
```
> **Explication** : Tableau BDC matériel : liste le matériel pour le bon de commande avec nom, référence, fournisseur, prix HT et fréquence (Mensuel ou Unique).

**Champs internes disponibles dans la boucle :**

| Champ interne | Description | Syntaxe |
|---------------|-------------|---------|
| `sp_bdc_mat_nom` | Nom du matériel | `{{sp_bdc_mat_nom}}` |
| `sp_bdc_mat_ref` | Référence du matériel | `{{sp_bdc_mat_ref}}` |
| `sp_bdc_mat_fournisseur` | Fournisseur | `{{sp_bdc_mat_fournisseur}}` |
| `sp_bdc_mat_quantite` | Quantité | `{{sp_bdc_mat_quantite}}` |
| `sp_bdc_mat_prix_ht` | Prix HT (texte formaté) | `{{sp_bdc_mat_prix_ht}}` |
| `sp_bdc_mat_frequence` | Fréquence (Mensuel / Unique) | `{{sp_bdc_mat_frequence}}` |

---

### 2.12 Cadeaux (`sp_cadeaux_table`)

**Syntaxe boucle :**
```
{{#sp_cadeaux_table}}
{{sp_cadeau_nom}}  {{sp_cadeau_ref}}  {{sp_cadeau_quantite}}  {{sp_cadeau_valeur_ht}}
{{/sp_cadeaux_table}}
```
> **Explication** : Tableau des cadeaux offerts dans la proposition avec nom, référence et valeur HT.

**Champs internes disponibles dans la boucle :**

| Champ interne | Description | Syntaxe |
|---------------|-------------|---------|
| `sp_cadeau_nom` | Nom du cadeau | `{{sp_cadeau_nom}}` |
| `sp_cadeau_ref` | Référence du cadeau | `{{sp_cadeau_ref}}` |
| `sp_cadeau_quantite` | Quantité | `{{sp_cadeau_quantite}}` |
| `sp_cadeau_valeur_ht` | Valeur HT (texte formaté) | `{{sp_cadeau_valeur_ht}}` |

---

## 3. Tableaux fusionnés dynamiques (personnalisables par template)

En plus des tableaux ci-dessus, vous pouvez créer des **tableaux fusionnés personnalisés** dans la configuration du template. Chaque tableau fusionné reçoit un **ID personnalisé** et combine les catégories de votre choix (mobiles, fixes, internet, materiel).

**Syntaxe :**
```
{{#mon_tableau_perso}}
  ...
{{/mon_tableau_perso}}
```

> **Note** : Les champs internes dépendent des catégories choisies. Si le tableau fusionne uniquement des lignes (mobiles/fixes/internet), les champs `sp_nom_ligne`, `sp_produit`, etc. seront disponibles. Si du matériel est inclus, les champs `sp_materiel_nom`, etc. le seront aussi.

**Catégories disponibles pour la fusion :**
- `mobiles` → Lignes mobiles
- `fixes` → Lignes fixes
- `internet` → Offres internet
- `materiel` → Matériel

---

## 4. Variables personnalisées (dynamiques par template / organisation)

### 4.1 Variables custom définies manuellement

Dans la configuration du template, vous pouvez définir des variables personnalisées (`SpVariableCustom`). Ces variables utilisent la syntaxe standard :

```
{{ma_variable_perso}}
```

> Les types possibles sont : `string`, `number`, `tableau`. Pour les tableaux custom, la syntaxe de boucle s'applique : `{{#mon_tableau_custom}} ... {{/mon_tableau_custom}}`.

### 4.2 Variables dérivées des questions SP

Lorsqu'une question SP a une conséquence de type **"Renseigner une variable"** (`renseigner_variable`), la valeur de la réponse est injectée dans une variable portant le nom défini dans la conséquence.

**Syntaxe :**
```
{{nom_variable_defini_dans_la_consequence}}
```

> Ces variables sont dynamiques et dépendent entièrement de la configuration des questions SP de l'organisation.

---

## 5. Récapitulatif rapide des syntaxes

| Type de variable | Syntaxe | Exemple |
|------------------|---------|---------|
| Variable simple (texte/nombre) | `{{nom_variable}}` | `{{sp_economie_mensuelle}}` |
| Boucle de tableau | `{{#nom_tableau}} ... {{/nom_tableau}}` | `{{#sp_lignes_mobiles}} {{sp_nom_ligne}} {{/sp_lignes_mobiles}}` |
| Champ interne de tableau | `{{champ_interne}}` (dans la boucle) | `{{sp_produit}}`, `{{sp_prix_propose}}` |
| Tableau fusionné personnalisé | `{{#id_personnalise}} ... {{/id_personnalise}}` | `{{#mon_recap}} {{sp_nom_ligne}} {{/mon_recap}}` |
| Variable custom / dérivée | `{{nom_variable}}` | `{{ma_variable_perso}}` |

---

## 6. Comment tester dans Word

1. Créez un document Word vide.
2. Copiez-collez la syntaxe de votre choix (ex: `{{sp_economie_mensuelle}}`).
3. Envoyez le document comme template dans l'application.
4. Générez une proposition avec des données SP.
5. Le document généré remplacera les variables par les valeurs réelles. Si une variable n'est pas disponible pour la proposition, Docxtemplater l'affichera telle quelle (ou lèvera une erreur selon la configuration).

> **Astuce** : Pour tester rapidement plusieurs variables, créez une liste dans Word avec toutes les syntaxes, générez le document, et vérifiez celles qui sont bien remplacées.

---

*Document généré le 2026-06-01 — Version SP du projet Saas_propal*
