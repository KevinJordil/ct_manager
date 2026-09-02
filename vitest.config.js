import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    // Environnement Node par défaut (helpers purs, tests serveur) ; les tests
    // de composants demandent happy-dom via un commentaire @vitest-environment.
    environment: 'node',
  },
})
