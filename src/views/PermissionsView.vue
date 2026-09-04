<script setup>
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useUsersStore } from '../stores/users.js'
import { usePersonsStore } from '../stores/persons.js'
import { useAuthStore } from '../stores/auth.js'
import { PERMISSIONS } from '../../permissions.js'

/** A permission is named after the resource it governs: "vehicles.manage". */
const resourceOf = permission => permission.split('.')[0]
import { personName } from '../labels.js'
import ListPlaceholder from '../components/common/ListPlaceholder.vue'
import ConfirmModal from '../components/common/ConfirmModal.vue'

const store = useUsersStore()
const personsStore = usePersonsStore()
const auth = useAuthStore()
const { t, te } = useI18n()

onMounted(() => {
  store.init()
  personsStore.init()
})

const error = ref('')
/** Accounts being saved, so their row can say so. */
const saving = ref(new Set())

const rows = computed(() =>
  [...store.users]
    .map(user => ({
      ...user,
      person: user.personId
        ? personsStore.persons.find(person => person.id === user.personId)
        : null,
    }))
    .sort((a, b) => a.username.localeCompare(b.username))
)

function holds(user, permission) {
  return user.role === 'admin' || user.permissions?.[permission] === true
}

/**
 * A tick changes what somebody else may do, so it is asked first — the
 * question names the right and the account, which is what a misplaced click
 * gets wrong.
 */
const pending = ref(null)

const confirmMessage = computed(() => {
  if (!pending.value) return ''
  const { user, permission, granting } = pending.value
  return t(granting ? 'permissions.grantConfirm' : 'permissions.revokeConfirm', {
    permission: t(`permissions.labels.${resourceOf(permission)}`),
    account: user.username,
  })
})

function ask(event, user, permission) {
  // The box must not look ticked before the question is answered; Vue would
  // not put it back on its own, since the bound value has not changed.
  event.target.checked = holds(user, permission)
  if (user.role === 'admin') return
  pending.value = { user, permission, granting: !holds(user, permission) }
}

async function apply() {
  const { user, permission } = pending.value
  pending.value = null
  await toggle(user, permission)
}

async function toggle(user, permission) {
  const permissions = { ...(user.permissions ?? {}) }
  if (permissions[permission]) delete permissions[permission]
  else permissions[permission] = true

  error.value = ''
  saving.value = new Set([...saving.value, user.id])
  try {
    await store.update(user.id, { permissions })
    // The rights of the account in use change what this session may do.
    if (user.id === auth.user?.id) await auth.verify()
  } catch (err) {
    const key = err.code ? `server.${err.code}` : null
    error.value = key && te(key) ? t(key, err.params ?? {}) : err.message
  } finally {
    const next = new Set(saving.value)
    next.delete(user.id)
    saving.value = next
  }
}
</script>

<template>
  <div>
    <h1 class="page-title">{{ $t('permissions.title') }}</h1>

    <div class="card mb-6 max-w-3xl">
      <p class="text-sm text-stone-700">{{ $t('permissions.intro') }}</p>
      <ul class="mt-2 space-y-1 text-sm text-stone-500 list-disc list-inside">
        <li>{{ $t('permissions.alwaysAllowed') }}</li>
        <li>{{ $t('permissions.granted') }}</li>
        <li>{{ $t('permissions.adminNote') }}</li>
      </ul>
    </div>

    <p v-if="error" role="alert" class="mb-4 p-3 rounded-md bg-red-50 border border-red-200 text-sm text-red-700">
      {{ error }}
    </p>

    <div v-if="rows.length" class="overflow-x-auto">
      <table class="w-full text-sm bg-white border border-stone-200 rounded-md">
        <thead>
          <tr class="border-b border-stone-200">
            <th class="text-left font-semibold text-stone-700 px-3 py-2">{{ $t('permissions.account') }}</th>
            <th v-for="permission in PERMISSIONS" :key="permission"
              class="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-stone-500 whitespace-nowrap">
              {{ $t(`permissions.labels.${resourceOf(permission)}`) }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="user in rows" :key="user.id" class="border-b border-stone-100 last:border-0">
            <td class="px-3 py-2 align-middle">
              <span class="font-medium text-stone-900">{{ user.username }}</span>
              <span v-if="user.person" class="ml-2 text-stone-500">{{ personName(user.person) }}</span>
              <span v-if="user.role === 'admin'" class="ml-2 badge-gray">{{ $t('users.roleAdmin') }}</span>
              <span v-if="user.id === auth.user?.id" class="ml-1 text-xs text-stone-400">{{ $t('users.you') }}</span>
              <span v-if="saving.has(user.id)" class="ml-2 text-xs text-stone-400">{{ $t('permissions.saving') }}</span>
            </td>
            <td v-for="permission in PERMISSIONS" :key="permission" class="px-3 py-2 text-center">
              <label class="inline-flex items-center justify-center min-w-[36px] min-h-[36px] cursor-pointer">
                <input type="checkbox" class="w-4 h-4 accent-olive-700"
                  :checked="holds(user, permission)"
                  :disabled="user.role === 'admin' || saving.has(user.id)"
                  :aria-label="$t('permissions.toggleLabel', {
                    permission: $t(`permissions.labels.${resourceOf(permission)}`), account: user.username,
                  })"
                  @change="ask($event, user, permission)" />
              </label>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <ListPlaceholder v-else :loading="!store.loaded" :message="$t('permissions.empty')" />

    <ConfirmModal
      v-if="pending"
      :title="$t(pending.granting ? 'permissions.grant' : 'permissions.revoke')"
      :message="confirmMessage"
      :confirm-label="$t(pending.granting ? 'permissions.grant' : 'permissions.revoke')"
      :tone="pending.granting ? 'primary' : 'danger'"
      @confirm="apply"
      @cancel="pending = null"
    />
  </div>
</template>
