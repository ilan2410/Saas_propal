# Debug Session: word-image-table-loop
- **Status**: [OPEN]
- **Issue**: Le template Word échoue avec `Cannot read properties of undefined (reading 'part')` quand une boucle `sp_materiel_detail` est répartie sur plusieurs cellules de tableau et que la première cellule contient `{{#sp_materiel_detail}}` puis `{{%sp_matd_image_url}}`.
- **Debug Server**: Pending startup
- **Log File**: .dbg/trae-debug-log-word-image-table-loop.ndjson
- **Session ID**: `word-image-table-loop`
- **Updated**: 2026-06-07

## Reproduction Steps
1. Créer un tableau Word avec une ligne de données.
2. Dans la première cellule, mettre `{{#sp_materiel_detail}}` puis `{{%sp_matd_image_url}}`.
3. Dans une autre cellule, mettre `{{sp_matd_nom}}`, puis dans une autre `{{sp_matd_quantite}}`.
4. Fermer avec `{{/sp_materiel_detail}}` dans la dernière cellule.
5. Lancer l'aperçu Word.

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | Le tag d'ouverture de boucle dans la même cellule que le tag image casse le module image | High | Low | Pending |
| B | Une boucle ouverte dans une cellule et fermée dans une autre cellule de la même ligne n'est pas supportée avec un tag image | High | Low | Pending |
| C | Word fragmente le contenu XML de la cellule image et le module image perd `part` | Medium | Medium | Pending |
| D | Le problème vient de la structure tableau + boucle + image, pas de la donnée image | High | Low | Pending |
| E | Le message d'erreur actuel n'explique pas correctement ce cas précis | Medium | Low | Pending |

## Planned Instrumentation
- Inspecter les fichiers XML Word (`word/document.xml`, headers, footers) pour localiser `sp_materiel_detail` et `sp_matd_image_url`.
- Journaliser la présence du tag image, du tag d'ouverture et du tag de fermeture dans les memes blocs XML ou cellules.
- Journaliser l'erreur brute Docxtemplater/ImageModule avec `properties.errors` pour distinguer parsing vs rendu image.
- Journaliser un echantillon de `sp_materiel_detail` avant rendu pour exclure un probleme de donnees.

## Log Evidence
- Log ligne 1 : le scan XML trouve `{{#sp_materiel_detail}}` dans `word/document.xml`, mais pas `{{%sp_matd_image_url}}` ni `{{/sp_materiel_detail}}` sous forme contigue dans le XML brut.
- Log ligne 2 : `sp_materiel_detail` contient bien 1 ligne materiel et aucune URL image ; ce point n'explique pas l'erreur car le module image sait deja tomber sur un placeholder.
- Log ligne 3 : l'erreur se produit dans `ImageModule.render` avec `Cannot read properties of undefined (reading 'part')`, donc au moment du rendu image/loop et non dans la preparation des donnees.

## Verification Conclusion
- A : **Partiellement confirmee** — le debut de boucle est bien vu dans la zone image, ce qui oriente vers une structure non supportee avec le module image.
- B : **Confirmee (pragmatique)** — la combinaison `boucle de tableau + image` telle qu'utilisee produit l'erreur runtime du module image.
- C : **Confirmee** — les tags image/fermeture ne sont pas retrouves contigus dans le XML brut, ce qui indique une fragmentation/structure Word incompatible avec l'attente du module.
- D : **Confirmee** — les donnees `sp_materiel_detail` ne sont pas la cause.
- E : **Confirmee** — le message actuel parle seulement de "tag image seul", alors que le vrai probleme est plus precis : structure de boucle/cellule/tableau non compatible.
