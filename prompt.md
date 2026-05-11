# Questions SP — Version Finale Consolidée

> **PropoBoost** · Télécom & Équipement bureau  
> Version monosite — Multisite géré au niveau des propositions (clone par site)

---

## Légende

| Symbole | Signification |
|---|---|
| `{{var}}` | Variable simple injectée dans le template Word |
| `{{#var}}…{{/var}}` | Variable tableau (lignes répétitives) |
| ✅ AUTO | Calculé automatiquement par l'IA de génération SP — pas une question posée |
| 🆕 | Issu de la V1 uniquement, ajouté lors de la consolidation |
| ⚠️ HORS BDC | Apparaît dans la SP mais pas dans le Bon de Commande opérateur |

---

## BLOC 0 — Configuration générale

### Q3 — Type de proposition

| Champ | Valeur |
|---|---|
| **Libellé** | Package ou Non Package ? |
| **Source** | Aucune (saisie manuelle) |
| **Affichage** | Boutons choix unique |
| **Variable SP** | `{{type_package}}` |
| **Calcul auto** | Non |
| **Conditions** | Toujours visible |

---

### Q4 — Durée du contrat

| Champ | Valeur |
|---|---|
| **Libellé** | Durée du contrat ? |
| **Source** | Aucune (saisie manuelle) |
| **Affichage** | Boutons choix unique |
| **Options** | `36 mois` / `48 mois` / `63 mois` |
| **Variable SP** | `{{duree_contrat}}` |
| **Calcul auto** | Non — mais conditionne les calculs loyer, remise et BDC |
| **Conditions** | Toujours visible |

---

## BLOC 1 — Opérateur

> 🔁 **Ce bloc est posé une seule fois** — chaque site a sa propre proposition.  
> Le multisite est géré en amont par le clone de SA (voir architecture multisite).

---

### Q5 — Éligibilité Fibre FTTH 🆕

| Champ | Valeur |
|---|---|
| **Libellé** | Le prospect est-il éligible à la Fibre FTTH ? |
| **Source** | Aucune (saisie manuelle) |
| **Affichage** | Oui / Non |
| **Variable SP** | `{{ftth_eligible}}` |
| **Calcul auto** | Non |
| **Conditions** | Toujours visible |

---

### Q6 — Configuration PTO

| Champ | Valeur |
|---|---|
| **Libellé** | Simple PTO ou Double PTO ? |
| **Source** | Aucune (saisie manuelle) |
| **Affichage** | Boutons choix unique |
| **Variable SP** | `{{pto_type}}` |
| **Calcul auto** | Non |
| **Conditions** | Si Q5 = Oui |

> Si **Simple PTO** → FAS 260 € + Routeur TPLINK ER706W + Branchement routeur (✅ AUTO)  
> Si **Double PTO** → afficher Q6a et Q6b

---

### Q6a — PTO 1 : type de fibre

| Champ | Valeur |
|---|---|
| **Libellé** | PTO 1 : Fibre FTTH ou Fibre Dédiée ? |
| **Source** | Aucune (saisie manuelle) |
| **Affichage** | Boutons choix unique |
| **Variable SP** | `{{pto1_type}}` · `{{pto1_abonnement}}` · `{{pto1_fas}}` |
| **Calcul auto** | FAS et frais inclus automatiquement selon type |
| **Conditions** | Si Q6 = Double PTO |

---

### Q6b — PTO 2 : type de fibre

| Champ | Valeur |
|---|---|
| **Libellé** | PTO 2 : Fibre FTTH ou Fibre Dédiée ? (sans routeur supplémentaire) |
| **Source** | Aucune (saisie manuelle) |
| **Affichage** | Boutons choix unique |
| **Variable SP** | `{{pto2_type}}` · `{{pto2_abonnement}}` · `{{pto2_fas}}` |
| **Calcul auto** | Frais inclus automatiquement — 1 seul routeur TPLINK ER706W suffit pour Double PTO |
| **Conditions** | Si Q6 = Double PTO |

---

### Q7 — Type de connexion (si pas de FTTH) 🆕

| Champ | Valeur |
|---|---|
| **Libellé** | Type de connexion internet ? |
| **Source** | Aucune (saisie manuelle) |
| **Affichage** | Boutons choix multiple |
| **Options** | `ADSL` · `VDSL` · `Data Only` · `Satellite Starlink` · `Fibre Dédiée` (options fixes) |
| **Variable SP** | `{{connexion_type}}` |
| **Calcul auto** | Non |
| **Conditions** | Si Q5 = Non |

---

### Q7a — Routeur Data Only

| Champ | Valeur |
|---|---|
| **Libellé** | Routeur 4G ou 5G ? |
| **Source** | Catalogue produits |
| **Affichage** | Boutons choix unique |
| **Variable SP** | `{{data_only_routeur}}` · `{{data_only_option5g}}` |
| **Calcul auto** | Option 5G à 2 €/mois ajoutée automatiquement si 5G |
| **Conditions** | Si Q7 inclut Data Only |

---

### Q7b — Installation Starlink

| Champ | Valeur |
|---|---|
| **Libellé** | Frais d'installation Starlink (€ HT) |
| **Source** | Aucune (saisie manuelle) |
| **Affichage** | Nombre (champ libre) |
| **Variable SP** | `{{starlink_installation}}` |
| **Calcul auto** | Non |
| **Conditions** | Si Q7 inclut Satellite Starlink |

> ⚠️ HORS BDC — Starlink souscrit par le client : apparaît dans la SP mais pas dans le BDC opérateur.

---

### Q7c — Fibre Dédiée : abonnement et FAS

| Champ | Valeur |
|---|---|
| **Libellé** | Fibre Dédiée : Abonnement mensuel (€ HT) + FAS (€ HT) |
| **Source** | Aucune (saisie manuelle) |
| **Affichage** | 2 champs libres numériques |
| **Variable SP** | `{{fibre_ded_abonnement}}` · `{{fibre_ded_fas}}` |
| **Calcul auto** | Non |
| **Conditions** | Si Q7 inclut Fibre Dédiée |

---

### Q8 — Connexion internet supplémentaire

| Champ | Valeur |
|---|---|
| **Libellé** | Souhaitez-vous ajouter une connexion internet supplémentaire ? |
| **Source** | Aucune (saisie manuelle) |
| **Affichage** | Oui / Non → Si Oui : relancer Q7 (sans option Double PTO) |
| **Variable SP** | `{{connexion_secondaire}}` · `{{connexion_secondaire_type}}` |
| **Calcul auto** | Non |
| **Conditions** | Si Simple PTO ou 1 seule connexion choisie — **masqué** si Double PTO ou 2 connexions |

---

### Q9 — Box TV et Backup 4G

| Champ | Valeur |
|---|---|
| **Libellé** | Prévoir une Box TV ? + Prévoir un Backup 4G ? |
| **Source** | Aucune (saisie manuelle) |
| **Affichage** | Oui / Non (2 questions séparées) |
| **Variable SP** | `{{box_tv}}` · `{{backup_4g}}` |
| **Calcul auto** | Non |
| **Conditions** | Box TV : toujours visible · Backup 4G : **masqué** si Double PTO ou 2 connexions |

> ⚠️ HORS BDC — Box TV souscrite par le client.

---

### Q10 — Standard téléphonique

| Champ | Valeur |
|---|---|
| **Libellé** | Le prospect souhaite-t-il un standard téléphonique ? |
| **Source** | Aucune (saisie manuelle) |
| **Affichage** | Oui / Non |
| **Variable SP** | `{{standard_tel}}` · `{{standard_fas}}` |
| **Calcul auto** | FAS 190 € ajouté automatiquement si Oui |
| **Conditions** | Toujours visible |

---

### Q11 — Licences Centrex / Softphone 🆕

| Champ | Valeur |
|---|---|
| **Libellé** | Nombre de licences + type par licence (Centrex ou Softphone) |
| **Source** | Catalogue + SA combinés (nombre de lignes/numéros détecté en SA, type de licence proposé depuis le catalogue) |
| **Affichage** | Nombre + choix par licence (liste déroulante) |
| **Variable SP** | `{{nb_licences}}` + tableau `{{#licences}}` |
| **Calcul auto** | Non |
| **Conditions** | Si Q10 = Oui |

**Variable tableau `{{#licences}}`** — champs :

| Champ | Type |
|---|---|
| `type` | string (`Centrex` ou `Softphone`) |
| `option_softphone` | string |
| `numero` | string |

> Si une licence = Centrex → proposer l'option Softphone sur cette licence.

---

### Q12 — Lignes analogiques et Fax

| Champ | Valeur |
|---|---|
| **Libellé** | Ligne(s) analogique(s) ? + Ligne fax ? (type : Analogique ou Fax par mail) |
| **Source** | Aucune (saisie manuelle) |
| **Affichage** | Oui / Non + choix liste manuelle pour le type |
| **Variable SP** | `{{ligne_analogique}}` · `{{ligne_fax}}` · `{{fax_type}}` |
| **Calcul auto** | Non |
| **Conditions** | Toujours visible |

---

### Q13 — Forfaits mobiles

| Champ | Valeur |
|---|---|
| **Libellé** | Nombre de forfaits mobiles + détail par ligne |
| **Source** | Catalogue + SA combinés (numéros et nombre de lignes détectés en SA, abonnements proposés depuis le catalogue) |
| **Affichage** | Nombre → détail par ligne (abonnement + option 5G + réseau) |
| **Variable SP** | `{{nb_mobiles}}` + tableau `{{#forfaits_mobiles}}` |
| **Calcul auto** | Non |
| **Conditions** | Toujours visible |

**Variable tableau `{{#forfaits_mobiles}}`** — champs :

| Champ | Type |
|---|---|
| `abonnement` | number |
| `option_5g` | string |
| `reseau` | string (`Orange` ou `Bouygues Telecom`) |
| `numero` | string |

---

### Q14 — Forfaits Data Only

| Champ | Valeur |
|---|---|
| **Libellé** | Nombre de forfaits Data Only (tablette / routeur) + détail par ligne |
| **Source** | Catalogue + SA combinés (forfaits Data Only détectés en SA, abonnements proposés depuis le catalogue) |
| **Affichage** | Nombre → détail par ligne (abonnement + option 5G + réseau) |
| **Variable SP** | `{{nb_data_only}}` + tableau `{{#forfaits_data_only}}` |
| **Calcul auto** | Non |
| **Conditions** | Toujours visible |

**Variable tableau `{{#forfaits_data_only}}`** — champs :

| Champ | Type |
|---|---|
| `abonnement` | number |
| `option_5g` | string |
| `reseau` | string |

---

### Q15 — Abonnements complémentaires 🆕

| Champ | Valeur |
|---|---|
| **Libellé** | Abonnements complémentaires DATA/VOIX + MOBILE |
| **Source** | Catalogue produits |
| **Affichage** | 2 champs texte long avec recherche catalogue |
| **Variable SP** | `{{abo_complement_voix}}` · `{{abo_complement_mobile}}` |
| **Calcul auto** | Non |
| **Conditions** | Toujours visible |

> DATA/VOIX : recherche parmi les abonnements Internet/Voix du catalogue  
> MOBILE : recherche parmi les abonnements Mobile du catalogue

---

### Q16 — Remise opérateur

| Champ | Valeur |
|---|---|
| **Libellé** | Souhaitez-vous appliquer une remise opérateur ? |
| **Source** | Aucune (saisie manuelle) |
| **Affichage** | Oui / Non |
| **Variable SP** | `{{remise_operateur}}` · `{{remise_operateur_montant}}` |
| **Calcul auto** | Non |
| **Conditions** | **Uniquement si Q4 = 63 mois** |

---

## BLOC 2 — Matériel

> ⚠️ Le routeur **n'est pas proposé ici** — déjà inclus dans le choix de connexion internet (BLOC 1).

---

### Q17 — Postes filaires

| Champ | Valeur |
|---|---|
| **Libellé** | Postes filaires : quantité + référence + casque sans fil ? + extension ? |
| **Source** | Catalogue produits |
| **Affichage** | Nombre + liste déroulante (réf) + 2× Oui/Non |
| **Variable SP** | `{{nb_postes_filaires}}` · `{{ref_poste_filaire}}` · `{{casque_sans_fil}}` · `{{extension_poste}}` |
| **Calcul auto** | Non |
| **Conditions** | Toujours visible |

---

### Q18 — Postes DECT (sans fil)

| Champ | Valeur |
|---|---|
| **Libellé** | Postes DECT : quantité + référence + type de borne |
| **Source** | Catalogue produits |
| **Affichage** | Nombre + liste déroulante (réf) + choix borne maître / relai |
| **Variable SP** | `{{nb_postes_dect}}` · `{{ref_poste_dect}}` · `{{borne_dect_type}}` · `{{borne_w70b_qte}}` · `{{borne_maitresse}}` · `{{borne_relai}}` |
| **Calcul auto** | ✅ Borne Yealink W70B : 1 si ≤ 10 DECT / 2 si > 10 DECT |
| **Conditions** | Toujours visible |

> Borne maître : Yealink W80DM — Borne relai : Yealink W80B

---

> ✅ **Switch et frais d'installation calculés automatiquement** selon nombre total de postes filaires + DECT :
>
> | Postes | Switch |
> |---|---|
> | 0 | Pas de switch |
> | 2 à 6 | Switch 8 ports |
> | 7 à 10 | Switch 12 ports |
> | 10 à 20 | Switch 24 ports |

---

### Q19 — Borne Wifi

| Champ | Valeur |
|---|---|
| **Libellé** | Borne(s) Wifi ? (quantité + réf. Omada AX1800) |
| **Source** | Catalogue produits |
| **Affichage** | Oui / Non + Nombre |
| **Variable SP** | `{{borne_wifi_qte}}` · `{{borne_wifi_ref}}` |
| **Calcul auto** | Non |
| **Conditions** | Toujours visible |

---

### Q20 — Pieuvre de conférence

| Champ | Valeur |
|---|---|
| **Libellé** | Pieuvre de conférence ? (quantité + référence) |
| **Source** | Catalogue produits |
| **Affichage** | Oui / Non + Nombre |
| **Variable SP** | `{{pieuvre_qte}}` · `{{pieuvre_ref}}` |
| **Calcul auto** | Non |
| **Conditions** | Toujours visible |

---

### Q21 — Matériel complémentaire

| Champ | Valeur |
|---|---|
| **Libellé** | Matériel complémentaire ? |
| **Source** | Catalogue produits |
| **Affichage** | Texte long + recherche catalogue |
| **Variable SP** | `{{materiel_complementaire}}` |
| **Calcul auto** | Non |
| **Conditions** | Toujours visible |

---

### Q22 — Geste commercial

| Champ | Valeur |
|---|---|
| **Libellé** | Geste commercial ? (smartphone / cadeau + date limite) |
| **Source** | Aucune (saisie manuelle) |
| **Affichage** | Oui / Non → Si Oui : choix type + valeur + date |
| **Variable SP** | `{{geste_commercial}}` · `{{geste_type}}` · `{{geste_valeur}}` · `{{geste_date_limite}}` |
| **Calcul auto** | Non |
| **Conditions** | Toujours visible |

> Mention automatique dans la SP — BDC MATÉRIEL sous les indemnités de résiliation :
> - *(Référence)* inclus pour toute souscription avant le *(date)*
> - Geste commercial d'une valeur de *(XXX € HT)* pour toute souscription avant le *(date)*

---

## BLOC 3 — Installation

> ✅ **Tous les frais d'installation sont calculés automatiquement** — aucune question posée sauf Q23.

---

### Calculs automatiques d'installation

| Élément | Règle | Variable SP |
|---|---|---|
| Installation Fibre FTTH | Branchement routeur + pré-visite = **390 € HT** | `{{install_ftth}}` |
| Installation Standard téléphonique | ≤ 10 postes = **590 € HT** · 11–20 = **790 € HT** · 21+ = **1 200 € HT** | `{{install_standard}}` |
| Switch + installation postes | Calculé selon nb postes filaires + DECT (tableau ci-dessus) | `{{switch_ref}}` · `{{switch_prix}}` · `{{install_postes}}` |

---

### Q23 — Interventions complémentaires 🆕

| Champ | Valeur |
|---|---|
| **Libellé** | Souhaitez-vous ajouter des interventions complémentaires ? |
| **Source** | Catalogue produits |
| **Affichage** | Oui / Non + liste |
| **Variable SP** | tableau `{{#interventions_compl}}` |
| **Calcul auto** | Non |
| **Conditions** | Toujours visible |

**Variable tableau `{{#interventions_compl}}`** — champs :

| Champ | Type |
|---|---|
| `type` | string |
| `prix` | number |

> Options : Pré-visite · Branchement routeur supplémentaire (TPLINK ER706W / MR100 / AX1800) · Installation supplémentaire

---

## BLOC 4 — Récapitulatif & Calcul du loyer

---

### Q24 — Indemnités de résiliation

| Champ | Valeur |
|---|---|
| **Libellé** | Indemnités de résiliation situation actuelle (€ HT) |
| **Source** | Données SA extraites (pré-rempli depuis extraction — confirmation) |
| **Affichage** | Nombre (confirmation SA) |
| **Variable SP** | `{{indemnites_resiliation}}` |
| **Calcul auto** | Non |
| **Conditions** | Toujours visible |

> Mention BDC matériel : *« Remboursement de X € au titre du solde définitif de vos contrats téléphoniques »*

---

### Q25 — Marge commerciale

| Champ | Valeur |
|---|---|
| **Libellé** | Marge souhaitée (€ HT) |
| **Source** | Aucune (saisie manuelle) |
| **Affichage** | Nombre (champ libre) ou suggestions : +1 000 € / +2 000 € / +3 000 € |
| **Variable SP** | `{{marge_commerciale}}` |
| **Calcul auto** | Non |
| **Conditions** | Toujours visible |

---

### Calculs automatiques du récapitulatif

| Élément | Règle | Variable SP |
|---|---|---|
| Total abonnement récurrent | Somme de tous les abonnements | `{{total_recurrent}}` |
| Remise mois offerts *(Package uniquement)* | 63 mois × 18 · 48 mois × 18 · 36 mois × 12 | `{{remise_mois_offerts}}` |
| Total ponctuel | Remise + indemnités + matériel + FAS + installation | `{{total_ponctuel}}` |
| **Loyer mensuel** | `ceil( (total_ponctuel + marge) × taux / 3 )` | `{{loyer_mensuel}}` |
| Remboursement participation BDC opérateur *(Package)* | total abo × 18 ou × 12 | `{{remboursement_participation}}` |
| Durée en trimestres pour BDC | 63 mois = 21T · 48 mois = 16T · 36 mois = 12T | `{{duree_trimestres}}` |

**Taux loyer selon durée :**

| Durée | Taux |
|---|---|
| 63 mois | 0,063 |
| 48 mois | 0,081 |
| 36 mois | 0,106 |

---

## BLOC 5 — Variables tableau — Récapitulatif

Ces 5 variables sont à **créer manuellement** dans `SpCustomVariablesEditor` avant de lancer le générateur IA.

| # | Variable | Alimentée par | Champs |
|---|---|---|---|
| T1 | `{{#forfaits_mobiles}}` | Q13 | `abonnement` · `option_5g` · `reseau` · `numero` |
| T2 | `{{#forfaits_data_only}}` | Q14 | `abonnement` · `option_5g` · `reseau` |
| T3 | `{{#licences}}` | Q11 | `type` · `option_softphone` · `numero` |
| T4 | `{{#interventions_compl}}` | Q23 | `type` · `prix` |

> La variable `{{#sites}}` a été supprimée — le multisite est désormais géré au niveau des propositions (clone par site).

---

## BLOC 6 — Exports et génération

- Exporter Situation Actuelle + Solution Proposée en tableau **Excel**
- Générer la **Proposition Commerciale Word** (modifiable)

---

## Récapitulatif des questions

| N° | Libellé court | Source | Affichage | Variable(s) | Conditions |
|---|---|---|---|---|---|
| Q3 | Package / Non Package | Aucune | Boutons | `{{type_package}}` | Toujours |
| Q4 | Durée du contrat | Aucune | Boutons | `{{duree_contrat}}` | Toujours |
| Q5 🆕 | Éligibilité FTTH | Aucune | Oui/Non | `{{ftth_eligible}}` | Toujours |
| Q6 | Simple / Double PTO | Aucune | Boutons | `{{pto_type}}` | Si Q5=Oui |
| Q6a | PTO 1 type fibre | Aucune | Boutons | `{{pto1_type}}` + prix | Si Double PTO |
| Q6b | PTO 2 type fibre | Aucune | Boutons | `{{pto2_type}}` + prix | Si Double PTO |
| Q7 🆕 | Type connexion (ADSL/VDSL/etc.) | Aucune | Choix multiple | `{{connexion_type}}` | Si Q5=Non |
| Q7a | Routeur 4G/5G | Catalogue produits | Boutons | `{{data_only_routeur}}` | Si Q7=Data Only |
| Q7b | Frais Starlink | Aucune | Nombre | `{{starlink_installation}}` | Si Q7=Starlink |
| Q7c | Fibre Dédiée abo+FAS | Aucune | 2 champs | `{{fibre_ded_abonnement}}` | Si Q7=Fibre Déd. |
| Q8 | Connexion supplémentaire | Aucune | Oui/Non | `{{connexion_secondaire}}` | Si 1 connexion |
| Q9 | Box TV + Backup 4G | Aucune | Oui/Non | `{{box_tv}}` `{{backup_4g}}` | Voir conditions |
| Q10 | Standard téléphonique | Aucune | Oui/Non | `{{standard_tel}}` | Toujours |
| Q11 🆕 | Licences Centrex/Softphone | Catalogue + SA combinés | Nombre+liste | `{{#licences}}` | Si Q10=Oui |
| Q12 | Analogique + Fax | Aucune | Oui/Non+liste | `{{ligne_analogique}}` `{{fax_type}}` | Toujours |
| Q13 | Forfaits mobiles | Catalogue + SA combinés | Nombre+détail | `{{#forfaits_mobiles}}` | Toujours |
| Q14 | Forfaits Data Only | Catalogue + SA combinés | Nombre+détail | `{{#forfaits_data_only}}` | Toujours |
| Q15 🆕 | Abonnements complémentaires | Catalogue produits | 2 champs texte | `{{abo_complement_voix}}` `{{abo_complement_mobile}}` | Toujours |
| Q16 | Remise opérateur | Aucune | Oui/Non | `{{remise_operateur}}` | Si Q4=63 mois |
| Q17 | Postes filaires | Catalogue produits | Nombre+liste | `{{nb_postes_filaires}}` `{{ref_poste_filaire}}` | Toujours |
| Q18 | Postes DECT | Catalogue produits | Nombre+liste | `{{nb_postes_dect}}` `{{borne_w70b_qte}}` ✅ | Toujours |
| Q19 | Borne Wifi | Catalogue produits | Oui/Non+nb | `{{borne_wifi_qte}}` | Toujours |
| Q20 | Pieuvre de conférence | Catalogue produits | Oui/Non+nb | `{{pieuvre_qte}}` | Toujours |
| Q21 | Matériel complémentaire | Catalogue produits | Texte+recherche | `{{materiel_complementaire}}` | Toujours |
| Q22 | Geste commercial | Aucune | Oui/Non+détail | `{{geste_commercial}}` `{{geste_valeur}}` | Toujours |
| Q23 🆕 | Interventions complémentaires | Catalogue produits | Oui/Non+liste | `{{#interventions_compl}}` | Toujours |
| Q24 | Indemnités résiliation | Données SA extraites | Nombre (conf.) | `{{indemnites_resiliation}}` | Toujours |
| Q25 | Marge commerciale | Aucune | Nombre+sugg. | `{{marge_commerciale}}` | Toujours |

---

*Version finale consolidée — V1 + V2 fusionnées — Multisite supprimé des questions SP*
