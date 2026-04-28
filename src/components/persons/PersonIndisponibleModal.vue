<script setup>
import { ref } from 'vue'
import BaseModal from '../common/BaseModal.vue'

const props = defineProps({ person: { type: Object, required: true } })
const emit = defineEmits(['save', 'close'])

const commentaire = ref(props.person.commentaireIndisponible ?? '')

function submit() {
  if (!commentaire.value.trim()) return
  emit('save', commentaire.value)
}
</script>

<template>
  <BaseModal title="Marquer indisponible" @close="$emit('close')">
    <form @submit.prevent="submit" class="space-y-4">
      <p class="text-sm text-gray-600">
        Personne : <strong>{{ person.grade ? person.grade + ' ' : '' }}{{ person.prenom }} {{ person.nom }}</strong>
      </p>
      <div>
        <label class="label">Motif d'indisponibilité *</label>
        <textarea v-model="commentaire" class="input" rows="3"
          placeholder="Ex : Assigné à la garde, affecté à une section, formation..."
          required autofocus />
      </div>
      <div class="flex justify-end gap-3 pt-2">
        <button type="button" @click="$emit('close')" class="btn-secondary">Annuler</button>
        <button type="submit" class="btn-primary">Confirmer</button>
      </div>
    </form>
  </BaseModal>
</template>
