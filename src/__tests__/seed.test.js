import { describe, it, expect } from 'vitest'
import { calculerDecalage, recaler } from '../../seed.js'
import { getMissionStatut } from '../availability.js'
import { toDateTimeStr } from '../datetime.js'

const REFERENCE = new Date(2026, 8, 2, 10, 0) // 2 septembre 2026

const missions = [
  { id: 'm1', titre: 'A', dateDebut: '2026-04-10T08:00', dateFin: '2026-04-10T17:00', vehicules: [], personnes: [] },
  { id: 'm2', titre: 'B', dateDebut: '2026-06-05T08:00', dateFin: '2026-06-05T17:00', vehicules: [], personnes: [] },
]

describe('calculerDecalage', () => {
  it('amène le milieu de la période sur la date de référence', () => {
    // Milieu de 10 avril → 5 juin : 8 mai. Du 8 mai au 2 septembre : 117 jours.
    expect(calculerDecalage({ missions }, REFERENCE)).toBe(117)
  })

  it('ne décale rien si le jeu est déjà centré', () => {
    const centre = [
      { id: 'm1', dateDebut: '2026-09-01T08:00', dateFin: '2026-09-01T17:00' },
      { id: 'm2', dateDebut: '2026-09-03T08:00', dateFin: '2026-09-03T17:00' },
    ]
    expect(calculerDecalage({ missions: centre }, REFERENCE)).toBe(0)
  })

  it('renvoie 0 en l\'absence de date', () => {
    expect(calculerDecalage({ vehicles: [{ id: 'v1', nom: 'Duro' }] }, REFERENCE)).toBe(0)
  })
})

describe('recaler', () => {
  it('décale les dates en conservant l\'heure', () => {
    const { missions: décalées } = recaler({ missions }, REFERENCE)
    expect(décalées[0].dateDebut).toBe('2026-08-05T08:00')
    expect(décalées[0].dateFin).toBe('2026-08-05T17:00')
    expect(décalées[1].dateDebut).toBe('2026-09-30T08:00')
  })

  it('conserve l\'écart entre les dates', () => {
    const { missions: décalées } = recaler({ missions }, REFERENCE)
    const jours = (a, b) =>
      Math.round((new Date(b) - new Date(a)) / 86400000)
    expect(jours(décalées[0].dateDebut, décalées[1].dateDebut))
      .toBe(jours(missions[0].dateDebut, missions[1].dateDebut))
  })

  it('décale aussi les dates imbriquées, comme les congés', () => {
    const persons = [{ id: 'p1', nom: 'X', conges: [{ id: 'c1', dateDebut: '2026-05-06T00:00', dateFin: '2026-05-12T23:59' }] }]
    const { persons: décalées } = recaler({ missions, persons }, REFERENCE)
    expect(décalées[0].conges[0].dateDebut).toBe('2026-08-31T00:00')
    expect(décalées[0].conges[0].dateFin).toBe('2026-09-06T23:59')
  })

  it('laisse intactes les chaînes qui ne sont pas des dates', () => {
    const vehicles = [{ id: 'v1', nom: 'Duro', immatriculation: 'M12345', commentairePret: '' }]
    const { vehicles: décalés } = recaler({ missions, vehicles }, REFERENCE)
    expect(décalés[0]).toEqual(vehicles[0])
  })

  it('centre toutes les collections avec le même décalage', () => {
    const persons = [{ id: 'p1', conges: [{ id: 'c1', dateDebut: '2026-05-06T00:00', dateFin: '2026-05-12T23:59' }] }]
    const avant = recaler({ missions, persons }, REFERENCE)
    const décalageMission = new Date(avant.missions[0].dateDebut) - new Date(missions[0].dateDebut)
    const décalageConge = new Date(avant.persons[0].conges[0].dateDebut) - new Date(persons[0].conges[0].dateDebut)
    expect(décalageMission).toBe(décalageConge)
  })
})

describe('jeu de démonstration livré', () => {
  it('présente une mission en cours, des missions passées et à venir', async () => {
    const { readFile } = await import('fs/promises')
    const lire = async n => JSON.parse(await readFile(new URL(`../../data.example/${n}.json`, import.meta.url), 'utf-8'))

    const collections = { missions: await lire('missions'), persons: await lire('persons') }
    const recalées = recaler(collections, REFERENCE)
    const maintenant = toDateTimeStr(REFERENCE)

    const statuts = recalées.missions.map(m => getMissionStatut(m, maintenant))
    expect(statuts).toContain('en cours')
    expect(statuts).toContain('terminée')
    expect(statuts).toContain('planifiée')
  })

  it('présente une personne en congé le jour de l\'installation', async () => {
    const { readFile } = await import('fs/promises')
    const lire = async n => JSON.parse(await readFile(new URL(`../../data.example/${n}.json`, import.meta.url), 'utf-8'))

    const collections = { missions: await lire('missions'), persons: await lire('persons') }
    const recalées = recaler(collections, REFERENCE)
    const maintenant = toDateTimeStr(REFERENCE)

    const enConge = recalées.persons.filter(p =>
      p.conges?.some(c => c.dateDebut <= maintenant && maintenant <= c.dateFin))
    expect(enConge.length).toBeGreaterThan(0)
  })
})
