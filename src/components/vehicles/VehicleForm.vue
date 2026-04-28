<script setup>
import { reactive, watch } from 'vue'
import BaseModal from '../common/BaseModal.vue'

const props = defineProps({ vehicle: { type: Object, default: null } })
const emit = defineEmits(['save', 'close'])

const form = reactive({ nom: '', immatriculation: '', categorie: 'léger-route', statut: 'libre', commentairePret: '', places: 4 })

watch(() => props.vehicle, (v) => {
  if (v) {
    form.nom = v.nom
    form.immatriculation = v.immatriculation
    form.categorie = v.categorie
    form.statut = v.statut
    form.commentairePret = v.commentairePret
    form.places = v.places ?? 4
  } else {
    form.nom = ''
    form.immatriculation = ''
    form.categorie = 'léger-route'
    form.statut = 'libre'
    form.commentairePret = ''
    form.places = 4
  }
}, { immediate: true })

function submit() {
  if (!form.nom.trim()) return
  if (form.statut === 'en prêt' && !form.commentairePret.trim()) return
  emit('save', { ...form })
}
</script>

<template>
  <BaseModal :title="vehicle ? 'Modifier le véhicule' : 'Nouveau véhicule'" @close="$emit('close')">
    <form @submit.prevent="submit" class="space-y-4">
      <div>
        <label class="label">Nom / Modèle *</label>
        <input v-model="form.nom" class="input" placeholder="Ex: VW Golf" required />
      </div>

      <div>
        <label class="label">Immatriculation</label>
        <input v-model="form.immatriculation" class="input" placeholder="Ex: MIL-001" />
      </div>

      <div>
        <label class="label">Nombre de places (passagers)</label>
        <input v-model.number="form.places" type="number" min="1" max="99" class="input" placeholder="Ex: 9" />
      </div>

      <div>
        <label class="label">Catégorie</label>
        <select v-model="form.categorie" class="input">
          <option value="léger-route">Léger (route) — permis 920+</option>
          <option value="léger-tt">Léger (tout-terrain) — permis 921+</option>
          <option value="moyen">Moyen ≤ 7.5t — permis 930+</option>
          <option value="lourd">Lourd > 7.5t — permis 931+</option>
        </select>
      </div>

      <div>
        <label class="label">Statut</label>
        <select v-model="form.statut" class="input">
          <option value="libre">Libre</option>
          <option value="en prêt">En prêt</option>
        </select>
      </div>

      <div v-if="form.statut === 'en prêt'">
        <label class="label">Commentaire de prêt *</label>
        <textarea v-model="form.commentairePret" class="input" rows="2" placeholder="À qui, jusqu'à quand..." required />
      </div>

      <div class="flex justify-end gap-3 pt-2">
        <button type="button" @click="$emit('close')" class="btn-secondary">Annuler</button>
        <button type="submit" class="btn-primary">{{ vehicle ? 'Enregistrer' : 'Créer' }}</button>
      </div>
    </form>
  </BaseModal>
</template>
