# Mission : Améliorer l'interface des "Suggestions IA" dans PropoBoost

## Contexte
PropoBoost est une plateforme SaaS Next.js 14 (TypeScript) qui génère des propositions commerciales automatisées. La fonctionnalité "Suggestions IA" utilise Claude AI pour analyser la situation télécom actuelle d'un client et proposer des produits optimisés depuis un catalogue.

Actuellement, les suggestions s'affichent en JSON brut dans un `<pre>`. L'objectif est de créer une interface visuelle professionnelle et intuitive.

## Stack technique
- Next.js 14 (App Router)
- TypeScript
- TailwindCSS
- Lucide React (icônes)
- Supabase (base de données)
- API Claude (Anthropic)

## Objectifs

### 1. NIVEAU 1 : Interface visuelle interactive

**Remplacer l'affichage JSON brut par :**

#### A) Composant `SuggestionsView.tsx`
Créer un nouveau composant dans `components/propositions/SuggestionsView.tsx` qui affiche :

**Pour chaque suggestion :**
- Card visuelle avec :
  - Header : Nom du produit proposé + Badge (✓ Économie en vert OU ⚠️ Surcoût en orange)
  - Comparaison visuelle : 2 colonnes côte à côte
    - Colonne gauche : "Actuellement" (fond gris) - prix_actuel + forfait actuel
    - Colonne droite : "Proposé" (fond bleu clair) - prix_propose + produit proposé
  - Bloc économie : 
    - Si économie > 0 : fond vert avec flèche descendante (TrendingDown), afficher économie mensuelle et annuelle
    - Si économie < 0 : fond orange avec flèche montante (TrendingUp), afficher surcoût mensuel et annuel
  - Justification : Icône ampoule (Lightbulb) + texte de justification

**Design moderne avec :**
- Bordures arrondies
- Ombres subtiles au hover
- Transitions fluides
- Espacement aéré
- Typographie hiérarchisée

#### B) Dashboard de synthèse globale
En haut des suggestions, afficher 3 cards métriques (grid 3 colonnes) :

1. **Économie mensuelle totale**
   - Icône Euro
   - Valeur avec couleur verte si positif, orange si négatif
   - Sous-titre : économie annuelle

2. **Réduction globale en %**
   - Icône TrendingDown
   - Calcul : `((cout_total_actuel - cout_total_propose) / cout_total_actuel) * 100`
   - Affichage : "X% de réduction" OU "X% d'augmentation"

3. **Lignes analysées**
   - Icône Package
   - Nombre de suggestions générées
   - Sous-titre : "produits optimisés"

### 2. NIVEAU 3 : Export PDF comparatif

#### A) Créer l'API route `/api/propositions/[id]/export-comparatif`
- Méthode : POST
- Input : `{ suggestions, synthese, proposition_id }`
- Utiliser `pdf-lib` pour générer un PDF professionnel avec :

**Structure du PDF :**

**Page 1 : Page de garde**
- Titre : "Analyse Comparative - Optimisation Télécom"
- Logo PropoBoost (si disponible)
- Nom du client
- Date de génération
- Message : "Proposition générée automatiquement par PropoBoost"

**Page 2 : Synthèse exécutive**
- Tableau récapitulatif :
```
  | Situation actuelle | Situation proposée | Différence |
  | 1 250€/mois        | 1 120€/mois        | -130€/mois |
  | 15 000€/an         | 13 440€/an         | -1 560€/an |
```
- Liste des améliorations (puces)
- Graphique en barres (coût actuel vs proposé)

**Pages 3+ : Comparatif détaillé ligne par ligne**
Pour chaque suggestion, un tableau :
```
┌─────────────────────────────────────────────────────────────┐
│ Ligne mobile 06XXXXXXXX                                     │
├─────────────────────┬───────────────────────┬───────────────┤
│ Situation actuelle  │ Situation proposée    │ Différence    │
├─────────────────────┼───────────────────────┼───────────────┤
│ Forfait: Pro 50Go   │ Forfait: Pro 100Go    │               │
│ Prix: 29.99€/mois   │ Prix: 24.99€/mois     │ -5€/mois      │
│                     │                       │ -60€/an       │
├─────────────────────┴───────────────────────┴───────────────┤
│ 💡 Justification:                                           │
│ Forfait plus avantageux avec 2x plus de data pour un prix  │
│ inférieur. Engagement identique 12 mois.                    │
└─────────────────────────────────────────────────────────────┘
```

**Dernière page : Pied de page personnalisable**
- Zone pour logo/coordonnées client (prévoir champ dans settings organisation)
- Texte légal / mentions
- Contact PropoBoost

**Note importante :** Prévoir dans la table `organizations` des champs :
```sql
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS pdf_header_logo_url TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS pdf_footer_text TEXT;
```

#### B) Bouton "Télécharger Comparatif PDF"
Ajouter un bouton dans `SuggestionsView.tsx` :
- Icône FileDown
- Texte : "Télécharger le comparatif PDF"
- Style : bouton principal (bg-blue-600)
- Au clic : appeler l'API et télécharger le PDF

### 3. Limitation : Un seul clic par proposition

#### Modifier `Step4EditData.tsx`
- Stocker dans la BDD (table `propositions`) un champ `suggestions_generees` (JSONB nullable)
- Au clic sur "Suggestions IA" :
  1. Vérifier si `suggestions_generees` est déjà rempli
  2. Si oui : afficher un message "Suggestions déjà générées pour cette proposition" + afficher les suggestions existantes
  3. Si non : générer les suggestions et les sauvegarder dans la BDD

**Migration SQL nécessaire :**
```sql
ALTER TABLE propositions ADD COLUMN IF NOT EXISTS suggestions_generees JSONB;
```

### 4. Correction du prompt Claude

#### Modifier `app/api/propositions/generer-suggestions/route.ts`
Remplacer le prompt actuel par :
```typescript
const prompt = `Tu es un expert en télécommunications. Analyse la situation actuelle du client et propose la meilleure combinaison de produits de notre catalogue.

SITUATION ACTUELLE:
${JSON.stringify(situation_actuelle ?? {}, null, 2)}

NOTRE CATALOGUE (${catalogue.length} produits):
${JSON.stringify(catalogue, null, 2)}

OBJECTIF: ${objectif}
${budgetMax ? `BUDGET MAX: ${budgetMax}€/mois` : ''}

INSTRUCTIONS:
1. Pour chaque ligne/service actuel, trouve le produit le plus adapté
2. Privilégie ${
      objectif === 'economie'
        ? 'les économies maximales'
        : objectif === 'performance'
          ? 'la meilleure performance'
          : "l'équilibre coût/performance"
    }
3. Calcule les économies mensuelles et annuelles selon la formule :
   • economie_mensuelle = prix_actuel - prix_propose
   • Si le résultat est POSITIF → économie réelle
   • Si le résultat est NÉGATIF → surcoût (produit proposé plus cher)
4. Justifie chaque choix

RETOURNE UN JSON:
{
  "suggestions": [
    {
      "ligne_actuelle": {...},
      "produit_propose_id": "uuid",
      "produit_propose_nom": "...",
      "prix_actuel": 0,
      "prix_propose": 0,
      "economie_mensuelle": 0,  // = prix_actuel - prix_propose (positif = économie, négatif = surcoût)
      "justification": "..."
    }
  ],
  "synthese": {
    "cout_total_actuel": 0,
    "cout_total_propose": 0,
    "economie_mensuelle": 0,  // = cout_total_actuel - cout_total_propose
    "economie_annuelle": 0,   // = economie_mensuelle * 12
    "ameliorations": ["..."]
  }
}

IMPORTANT - GESTION DES SURCOÛTS:
- Si le produit proposé est plus cher, l'économie_mensuelle sera NÉGATIVE
- Dans la justification, explique clairement pourquoi le surcoût est justifié (meilleure performance, engagement plus court, etc.)
- L'objectif "${objectif}" doit guider tes choix, même si cela implique un léger surcoût pour une meilleure performance ou qualité`;
```

## Fichiers à créer/modifier

### Nouveaux fichiers :
1. `components/propositions/SuggestionsView.tsx` - Interface visuelle des suggestions
2. `components/propositions/MetricCard.tsx` - Card métrique réutilisable
3. `app/api/propositions/[id]/export-comparatif/route.ts` - Export PDF
4. `lib/pdf/comparatif-generator.ts` - Logique de génération PDF
5. `supabase/migrations/YYYYMMDD_add_suggestions_fields.sql` - Migration BDD

### Fichiers à modifier :
1. `components/propositions/Step4EditData.tsx` - Intégrer SuggestionsView + logique limitation
2. `app/api/propositions/generer-suggestions/route.ts` - Corriger prompt + sauvegarder en BDD
3. `types/index.ts` - Ajouter types TypeScript pour Suggestion et Synthese

## Contraintes importantes

1. **Performance** : Le PDF doit se générer en moins de 3 secondes
2. **Responsive** : L'interface doit être parfaite sur mobile/tablette/desktop
3. **Accessibilité** : Couleurs contrastées, textes lisibles
4. **TypeScript strict** : Tous les types doivent être explicites
5. **Gestion d'erreurs** : Try/catch partout avec messages utilisateur clairs
6. **Loading states** : Spinners pendant génération PDF

## Livrables attendus

1. ✅ Interface visuelle des suggestions complète et fonctionnelle
2. ✅ Dashboard de synthèse avec 3 métriques
3. ✅ Export PDF professionnel et téléchargeable
4. ✅ Limitation à un seul clic par proposition
5. ✅ Prompt corrigé avec calcul cohérent des économies
6. ✅ Migration SQL pour nouveaux champs
7. ✅ Types TypeScript complets
8. ✅ Gestion d'erreurs robuste

## Notes supplémentaires

- Utiliser les composants shadcn/ui si disponibles (Button, Card, Badge)
- Suivre les conventions de nommage du projet existant
- Commenter le code pour les parties complexes
- Tester avec des données réelles du catalogue

Commence par analyser l'architecture existante du projet, puis implémente les fonctionnalités dans l'ordre logique. N'hésite pas à me demander des clarifications si nécessaire.