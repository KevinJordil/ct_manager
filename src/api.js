const BASE = '/api'
const CLE_STOCKAGE = 'ct_manager_token'

/** Erreur d'appel à l'API, avec le code HTTP quand il y en a un. */
export class ApiError extends Error {
  constructor(message, { status = null, version = null, cause = null } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.version = version
    this.cause = cause
  }
}

// ── Clé d'accès ──
// Le serveur ne l'exige que si CT_TOKEN est défini de son côté.

function lireCle() {
  try {
    return localStorage.getItem(CLE_STOCKAGE) ?? ''
  } catch {
    return '' // navigation privée, stockage bloqué…
  }
}

let cle = lireCle()

export function definirCle(valeur) {
  cle = valeur ?? ''
  try {
    if (cle) localStorage.setItem(CLE_STOCKAGE, cle)
    else localStorage.removeItem(CLE_STOCKAGE)
  } catch { /* le stockage peut être indisponible : la clé vaut pour la session */ }
}

export function aUneCle() {
  return Boolean(cle)
}

// ── Requêtes ──

async function messageDErreur(res) {
  try {
    const body = await res.json()
    if (body?.error) return { message: body.error, version: body.version ?? null }
  } catch { /* réponse non JSON */ }
  return { message: `HTTP ${res.status}`, version: null }
}

async function requete(url, options = {}) {
  const headers = { ...options.headers }
  if (cle) headers.Authorization = `Bearer ${cle}`

  let res
  try {
    res = await fetch(url, { ...options, headers })
  } catch (err) {
    throw new ApiError('Serveur injoignable', { cause: err })
  }
  if (!res.ok) {
    const { message, version } = await messageDErreur(res)
    throw new ApiError(message, { status: res.status, version })
  }
  return res
}

/** Version courante de la collection, telle que renvoyée par le serveur */
function versionDe(res) {
  return (res.headers.get('ETag') ?? '').replace(/"/g, '')
}

export const api = {
  /** @returns {{ data: Array, version: string }} */
  async load(entity) {
    const res = await requete(`${BASE}/${entity}`)
    return { data: await res.json(), version: versionDe(res) }
  },

  /**
   * Enregistre la collection complète.
   *
   * `version` est celle reçue au dernier chargement : le serveur refuse
   * l'écriture (409) si les données ont changé entre-temps, ce qui évite
   * qu'un second onglet écrase silencieusement le travail du premier.
   *
   * Lève une ApiError en cas d'échec — un échec silencieux ferait croire à
   * l'utilisateur que ses modifications sont enregistrées.
   */
  async save(entity, data, version) {
    const res = await requete(`${BASE}/${entity}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'If-Match': version ?? '' },
      body: JSON.stringify(data),
    })
    const body = await res.json()
    return { version: body.version ?? versionDe(res) }
  },
}
