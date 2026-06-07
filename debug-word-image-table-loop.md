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
- Pending

## Verification Conclusion
- Pending
