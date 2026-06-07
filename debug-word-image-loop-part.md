# Debug Session: word-image-loop-part
- **Status**: [OPEN]
- **Issue**: L'aperçu Word échoue avec `Cannot read properties of undefined (reading 'part')` quand le template contient `{{#sp_materiel_detail}} {{%sp_matd_image_url}} {{sp_matd_nom}} {{sp_matd_quantite}} {{/sp_materiel_detail}}`.
- **Debug Server**: Pending startup
- **Log File**: .dbg/trae-debug-log-word-image-loop-part.ndjson

## Reproduction Steps
1. Ouvrir l'aperçu du template Word.
2. Utiliser une boucle `sp_materiel_detail` contenant un tag image `{{%sp_matd_image_url}}`.
3. Constater l'erreur `Cannot read properties of undefined (reading 'part')`.

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | Le tag image `%sp_matd_image_url` est fractionné par la structure Word dans une cellule de tableau ou un run, ce que le module image ne supporte pas | High | Medium | Pending |
| B | Le module image reçoit une valeur ou un contexte invalide dans une boucle et tente de lire `part` sur un tag absent | High | Low | Pending |
| C | Le souci vient du template saisi sur une seule ligne, avec espaces/tabulations, plus que de la donnée elle-même | Medium | Low | Pending |
| D | `sp_matd_image_url` n'est pas toujours défini et le module image gère mal ce cas dans l'aperçu | Medium | Low | Pending |
| E | L'aperçu Word et la génération finale ne passent pas exactement par la même configuration du module image | Low | Low | Pending |

## Log Evidence
- Pending

## Verification Conclusion
- Pending
