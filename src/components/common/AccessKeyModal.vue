<script setup>
import { ref } from 'vue'
import BaseModal from './BaseModal.vue'
import { definirCle } from '../../api.js'

const emit = defineEmits(['close'])
const cle = ref('')

function valider() {
  if (!cle.value.trim()) return
  definirCle(cle.value.trim())
  // Le plus sûr après un changement de clé : repartir d'un état propre,
  // toutes les collections étant à recharger.
  window.location.reload()
}
</script>

<template>
  <BaseModal title="Clé d'accès" @close="emit('close')">
    <form @submit.prevent="valider" class="space-y-4">
      <p class="text-sm text-gray-600">
        Ce serveur demande une clé d'accès (variable <code class="text-xs bg-gray-100 px-1 py-0.5 rounded">CT_TOKEN</code>).
        Elle est conservée dans ce navigateur.
      </p>
      <div>
        <label class="label" for="cle-acces">Clé</label>
        <input id="cle-acces" v-model="cle" type="password" class="input"
          autocomplete="current-password" placeholder="Clé d'accès" required />
      </div>
      <div class="flex justify-end gap-3">
        <button type="button" @click="emit('close')" class="btn-secondary">Annuler</button>
        <button type="submit" class="btn-primary">Valider</button>
      </div>
    </form>
  </BaseModal>
</template>
