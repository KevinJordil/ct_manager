import { createI18n } from 'vue-i18n'
import fr from '../locales/fr.json'
import de from '../locales/de.json'
import it from '../locales/it.json'

const STORAGE_KEY = 'ct_manager_locale'

/** Languages offered in the interface, with the tag used for date formatting. */
export const SUPPORTED_LOCALES = [
  { code: 'fr', label: 'Français', tag: 'fr-CH' },
  { code: 'de', label: 'Deutsch', tag: 'de-CH' },
  { code: 'it', label: 'Italiano', tag: 'it-CH' },
]

export const DEFAULT_LOCALE = 'fr'

const CODES = SUPPORTED_LOCALES.map(l => l.code)

function storedLocale() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return CODES.includes(stored) ? stored : null
  } catch {
    return null // private browsing, storage blocked…
  }
}

/** Best supported match for the browser's preferences */
function browserLocale() {
  if (typeof navigator === 'undefined') return null
  const preferences = navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const preference of preferences) {
    const code = String(preference).slice(0, 2).toLowerCase()
    if (CODES.includes(code)) return code
  }
  return null
}

export function initialLocale() {
  return storedLocale() ?? browserLocale() ?? DEFAULT_LOCALE
}

export const i18n = createI18n({
  legacy: false,
  locale: initialLocale(),
  fallbackLocale: DEFAULT_LOCALE,
  messages: { fr, de, it },
})

/** Switches language, remembers the choice and updates <html lang>. */
export function setLocale(code) {
  if (!CODES.includes(code)) return
  i18n.global.locale.value = code
  try {
    localStorage.setItem(STORAGE_KEY, code)
  } catch { /* the choice lasts for this session only */ }
  if (typeof document !== 'undefined') document.documentElement.setAttribute('lang', code)
}

/** Locale tag to hand to Intl for the active language */
export function localeTag(code = i18n.global.locale.value) {
  return SUPPORTED_LOCALES.find(l => l.code === code)?.tag ?? code
}
