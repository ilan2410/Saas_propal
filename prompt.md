

## Modifications à appliquer

### 1. Modifier `lib/ai/claude.ts`

Dans la fonction `extractDataFromDocuments`, je dois appliquer 4 changements :

#### Changement A : Ajouter `temperature: 0`
Vers la ligne 53, dans l'appel `anthropic.messages.create()`, ajouter le paramètre `temperature: 0` pour avoir des résultats déterministes.

**Avant :**
```typescript
const message = await anthropic.messages.create({
  model: claude_model || 'claude-sonnet-4-5-20250929',
  max_tokens: 8192,
  messages: [...]
});
```

**Après :**
```typescript
const message = await anthropic.messages.create({
  model: claude_model || 'claude-sonnet-4-5-20250929',
  max_tokens: 8192,
  temperature: 0, // Résultats déterministes
  messages: [...]
});
```



