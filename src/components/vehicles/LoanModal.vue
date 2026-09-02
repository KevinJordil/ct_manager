<script setup>
import { ref } from 'vue'
import BaseModal from '../common/BaseModal.vue'

defineProps({ vehicle: { type: Object, required: true } })
const emit = defineEmits(['save', 'close'])

const commentaire = ref('')

function submit() {
  if (!commentaire.value.trim()) return
  emit('save', commentaire.value)
}
</script>

<template>
  <BaseModal title="Mettre en prêt" @close="$emit('close')">
    <form @submit.prevent="submit" class="space-y-4">
      <p class="text-sm text-gray-600">Véhicule : <strong>{{ vehicle.nom }}</strong></p>
      <div>
        <label class="label" for="pret-commentaire">Commentaire de prêt *</label>
        <textarea id="pret-commentaire" v-model="commentaire" class="input" rows="3" placeholder="À qui est prêté le véhicule, jusqu'à quand..." required autofocus />
      </div>
      <div class="flex justify-end gap-3 pt-2">
        <button type="button" @click="$emit('close')" class="btn-secondary">Annuler</button>
        <button type="submit" class="btn-primary">Confirmer le prêt</button>
      </div>
    </form>
  </BaseModal>
</template>
