import { describe, it, expect, beforeEach, vi } from 'vitest'

const chargements = vi.hoisted(() => ({ load: null, save: null }))

vi.mock('../api.js', () => ({
  ApiError: class ApiError extends Error {
    constructor(message, { status = null, version = null } = {}) {
      super(message); this.status = status; this.version = version
    }
  },
  api: {
    load: (...args) => chargements.load(...args),
    save: (...args) => chargements.save(...args),
  },
}))

const { useCollection } = await import('../stores/collection.js')
const { useSync } = await import('../stores/sync.js')
const { ApiError } = await import('../api.js')

const sync = useSync()

beforeEach(() => {
  sync.effacerErreur()
  chargements.load = async () => ({ data: [], version: 'v1' })
  chargements.save = async () => ({ version: 'v2' })
})

/** Laisse les promesses en attente se résoudre */
const laisserTourner = () => new Promise(r => setTimeout(r, 0))

describe('useCollection — chargement', () => {
  it('charge les données et applique la migration', async () => {
    chargements.load = async () => ({ data: [{ id: 'a' }], version: 'v1' })
    const c = useCollection('persons', data => data.map(d => ({ ...d, migre: true })))
    await c.init()
    expect(c.items.value).toEqual([{ id: 'a', migre: true }])
  })

  it('ne charge qu\'une fois même si plusieurs vues le demandent', async () => {
    let appels = 0
    chargements.load = async () => { appels++; return { data: [], version: 'v1' } }
    const c = useCollection('persons')
    await Promise.all([c.init(), c.init(), c.init()])
    expect(appels).toBe(1)
  })

  it('signale une erreur de chargement', async () => {
    chargements.load = async () => { throw new ApiError('Serveur injoignable') }
    const c = useCollection('persons')
    await c.init()
    expect(sync.erreur.value).toMatch(/Chargement impossible/)
  })

  it('recharger repart d\'un appel neuf', async () => {
    let appels = 0
    chargements.load = async () => { appels++; return { data: [], version: `v${appels}` } }
    const c = useCollection('persons')
    await c.init()
    await c.recharger()
    expect(appels).toBe(2)
  })
})

describe('useCollection — enregistrement', () => {
  it('transmet la version reçue au chargement', async () => {
    const vues = []
    chargements.save = async (_e, _d, version) => { vues.push(version); return { version: 'v2' } }
    const c = useCollection('persons')
    await c.init()
    c.add({ nom: 'X' })
    await laisserTourner()
    expect(vues).toEqual(['v1'])
  })

  it('utilise la nouvelle version à l\'enregistrement suivant', async () => {
    const vues = []
    let n = 1
    chargements.save = async (_e, _d, version) => { vues.push(version); return { version: `v${++n}` } }
    const c = useCollection('persons')
    await c.init()
    c.add({ nom: 'X' }); await laisserTourner()
    c.add({ nom: 'Y' }); await laisserTourner()
    expect(vues).toEqual(['v1', 'v2'])
  })

  it('refuse d\'enregistrer si le chargement a échoué', async () => {
    chargements.load = async () => { throw new ApiError('Serveur injoignable') }
    let sauvegardes = 0
    chargements.save = async () => { sauvegardes++; return { version: 'v2' } }

    const c = useCollection('persons')
    await c.init()
    c.add({ nom: 'X' })
    await laisserTourner()

    // Sans cette garde, la collection vide en mémoire écraserait le serveur.
    expect(sauvegardes).toBe(0)
    expect(sync.erreur.value).toMatch(/enregistrement annulé/)
  })

  it('signale un conflit avec un autre onglet', async () => {
    chargements.save = async () => { throw new ApiError('modifiées ailleurs', { status: 409, version: 'v9' }) }
    const c = useCollection('persons')
    await c.init()
    c.add({ nom: 'X' })
    await laisserTourner()
    expect(sync.conflit.value).toBe(true)
    expect(sync.erreur.value).toMatch(/modifiées ailleurs/)
  })

  it('signale une clé d\'accès manquante', async () => {
    chargements.save = async () => { throw new ApiError('Clé requise', { status: 401 }) }
    const c = useCollection('persons')
    await c.init()
    c.add({ nom: 'X' })
    await laisserTourner()
    expect(sync.cleRequise.value).toBe(true)
  })

  it('efface l\'erreur après un enregistrement réussi', async () => {
    const c = useCollection('persons')
    await c.init()
    chargements.save = async () => { throw new ApiError('Serveur injoignable') }
    c.add({ nom: 'X' }); await laisserTourner()
    expect(sync.erreur.value).not.toBeNull()

    chargements.save = async () => ({ version: 'v3' })
    c.add({ nom: 'Y' }); await laisserTourner()
    expect(sync.erreur.value).toBeNull()
  })
})

describe('useCollection — CRUD', () => {
  it('ajoute avec un identifiant unique', async () => {
    const c = useCollection('persons')
    await c.init()
    const a = c.add({ nom: 'A' })
    const b = c.add({ nom: 'B' })
    expect(a.id).not.toBe(b.id)
    expect(c.items.value).toHaveLength(2)
  })

  it('met à jour sans laisser réécrire l\'identifiant', async () => {
    const c = useCollection('persons')
    await c.init()
    const a = c.add({ nom: 'A' })
    c.update(a.id, { nom: 'B', id: 'usurpé' })
    expect(c.items.value[0]).toMatchObject({ id: a.id, nom: 'B' })
  })

  it('ignore la mise à jour d\'un élément inexistant', async () => {
    const c = useCollection('persons')
    await c.init()
    c.update('fantôme', { nom: 'X' })
    expect(c.items.value).toEqual([])
  })

  it('supprime un élément', async () => {
    const c = useCollection('persons')
    await c.init()
    const a = c.add({ nom: 'A' })
    c.remove(a.id)
    expect(c.items.value).toEqual([])
  })

  it('mutate applique la modification à l\'élément visé', async () => {
    const c = useCollection('persons')
    await c.init()
    const a = c.add({ nom: 'A' })
    c.mutate(a.id, item => { item.nom = 'Modifié' })
    expect(c.items.value[0].nom).toBe('Modifié')
  })
})
