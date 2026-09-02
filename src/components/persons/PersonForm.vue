<script setup>
import { reactive, watch } from 'vue'
import BaseModal from '../common/BaseModal.vue'

const props = defineProps({ person: { type: Object, default: null } })
const emit = defineEmits(['save', 'close'])

const PERMIS_OPTIONS = ['920', '920E', '921', '921E', '930', '930E', '931', '931E']

const PERMIS_COLORS = {
  '920':  'bg-sky-100 text-sky-700 border-sky-300',
  '920E': 'bg-sky-200 text-sky-800 border-sky-400',
  '921':  'bg-teal-100 text-teal-700 border-teal-300',
  '921E': 'bg-teal-200 text-teal-800 border-teal-400',
  '930':  'bg-violet-100 text-violet-700 border-violet-300',
  '930E': 'bg-violet-200 text-violet-800 border-violet-400',
  '931':  'bg-orange-100 text-orange-700 border-orange-300',
  '931E': 'bg-orange-200 text-orange-800 border-orange-400',
}

const form = reactive({ grade: '', nom: '', prenom: '', permis: [], notes: '' })

watch(() => props.person, (p) => {
  if (p) {
    form.grade = p.grade ?? ''
    form.nom = p.nom
    form.prenom = p.prenom
    form.permis = [...p.permis]
    form.notes = p.notes
  } else {
    form.grade = ''
    form.nom = ''
    form.prenom = ''
    form.permis = []
    form.notes = ''
  }
}, { immediate: true })

function togglePermis(p) {
  const idx = form.permis.indexOf(p)
  if (idx === -1) form.permis.push(p)
  else form.permis.splice(idx, 1)
}

function submit() {
  if (!form.nom.trim() || !form.prenom.trim()) return
  emit('save', { ...form })
}
</script>

<template>
  <BaseModal :title="person ? 'Modifier la personne' : 'Nouvelle personne'" @close="$emit('close')">
    <form @submit.prevent="submit" class="space-y-4">
      <div class="grid grid-cols-3 gap-3">
        <div>
          <label class="label" for="personne-grade">Grade</label>
          <input id="personne-grade" v-model="form.grade" class="input" placeholder="Ex: Sdt, Cpl…" />
        </div>
        <div>
          <label class="label" for="personne-prenom">Prénom *</label>
          <input id="personne-prenom" v-model="form.prenom" class="input" placeholder="Prénom" required />
        </div>
        <div>
          <label class="label" for="personne-nom">Nom *</label>
          <input id="personne-nom" v-model="form.nom" class="input" placeholder="Nom" required />
        </div>
      </div>

      <div>
        <span class="label" id="personne-permis-label">Permis de conduire (permis militaires suisses)</span>
        <div class="flex flex-wrap gap-2 mt-1" role="group" aria-labelledby="personne-permis-label">
          <button v-for="p in PERMIS_OPTIONS" :key="p" type="button"
            @click="togglePermis(p)"
            :class="['px-3 py-1.5 rounded-lg text-sm font-medium border transition-all',
              form.permis.includes(p)
                ? PERMIS_COLORS[p]
                : 'bg-white border-gray-300 text-gray-500 hover:border-gray-400']">
            {{ p }}
          </button>
        </div>
      </div>

      <div>
        <label class="label" for="personne-notes">Notes</label>
        <textarea id="personne-notes" v-model="form.notes" class="input" rows="3" placeholder="Notes libres..." />
      </div>

      <div class="flex justify-end gap-3 pt-2">
        <button type="button" @click="$emit('close')" class="btn-secondary">Annuler</button>
        <button type="submit" class="btn-primary">{{ person ? 'Enregistrer' : 'Créer' }}</button>
      </div>
    </form>
  </BaseModal>
</template>
