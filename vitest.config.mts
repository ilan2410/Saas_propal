import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Aligne l'alias `@/*` de tsconfig.json (racine du repo) pour que les tests
// puissent importer des modules applicatifs qui utilisent ce préfixe.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
});
