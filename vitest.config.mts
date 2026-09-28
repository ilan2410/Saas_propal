import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Aligne l'alias `@/*` de tsconfig.json (racine du repo) pour que les tests
// puissent importer des modules applicatifs qui utilisent ce préfixe.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
      // `server-only` est résolu en interne par Next.js et n'existe pas dans
      // node_modules : sans cet alias, tout test d'un module portant ce
      // garde-fou échoue au chargement.
      'server-only': fileURLToPath(new URL('./test/stubs/server-only.ts', import.meta.url)),
    },
  },
});
