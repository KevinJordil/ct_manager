import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      // Under Node, "vue-i18n" resolves to a build whose exports vitest cannot
      // call directly; point at the bundler build the app itself uses.
      'vue-i18n': 'vue-i18n/dist/vue-i18n.esm-bundler.js',
    },
  },
  define: {
    // Silences the vue-i18n bundler build's feature-flag warnings.
    __VUE_I18N_FULL_INSTALL__: true,
    __VUE_I18N_LEGACY_API__: false,
    __INTLIFY_PROD_DEVTOOLS__: false,
  },
  test: {
    // Node by default (pure helpers, server tests); component tests ask for
    // happy-dom through a @vitest-environment comment.
    environment: 'node',
  },
})
