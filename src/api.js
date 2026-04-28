const BASE = '/api'

export const api = {
  async load(entity) {
    const res = await fetch(`${BASE}/${entity}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  },

  save(entity, data) {
    return fetch(`${BASE}/${entity}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).catch(err => console.warn(`[api] save ${entity} failed:`, err))
  },
}
