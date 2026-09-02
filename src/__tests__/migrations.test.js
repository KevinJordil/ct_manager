import { describe, it, expect } from 'vitest'
import { migratePersons, migrateVehicles, migrateMissions } from '../migrations.js'

/**
 * These tests guard the upgrade path: a file written by any earlier release
 * must still load, with nothing lost along the way.
 */

describe('migratePersons — French schema', () => {
  const legacy = {
    id: '2001001',
    grade: 'Sgt',
    prenom: 'Andreas',
    nom: 'Müller',
    permis: ['930', '930E'],
    notes: 'Chef de groupe',
    conges: [{ id: 'c1', dateDebut: '2026-05-06T00:00', dateFin: '2026-05-12T23:59' }],
    indisponible: true,
    commentaireIndisponible: 'Garde',
  }

  it('renames every field without losing a value', () => {
    const [person] = migratePersons([legacy])
    expect(person).toEqual({
      id: '2001001',
      rank: 'Sgt',
      firstName: 'Andreas',
      lastName: 'Müller',
      licenses: ['930', '930E'],
      notes: 'Chef de groupe',
      leaves: [{ id: 'c1', startDate: '2026-05-06T00:00', endDate: '2026-05-12T23:59' }],
      unavailable: true,
      unavailabilityNote: 'Garde',
    })
  })

  it('leaves no French key behind', () => {
    const [person] = migratePersons([legacy])
    for (const key of ['grade', 'prenom', 'nom', 'permis', 'conges', 'indisponible', 'commentaireIndisponible']) {
      expect(person).not.toHaveProperty(key)
    }
  })

  it('maps civilian licence codes to the Swiss military ones', () => {
    const [person] = migratePersons([{ ...legacy, permis: ['B', 'BE', 'C', 'CE'] }])
    expect(person.licenses).toEqual(['920', '920E', '930', '930E'])
  })

  it('turns the oldest "en congé" status into a leave period', () => {
    const [person] = migratePersons([{ id: 'p1', nom: 'X', prenom: 'Y', statut: 'en congé' }])
    expect(person.leaves).toHaveLength(1)
    expect(person).not.toHaveProperty('statut')
  })

  it('adds the default times to dateless leaves', () => {
    const [person] = migratePersons([{
      ...legacy, conges: [{ id: 'c1', dateDebut: '2026-05-06', dateFin: '2026-05-12' }],
    }])
    expect(person.leaves[0]).toEqual({ id: 'c1', startDate: '2026-05-06T00:00', endDate: '2026-05-12T23:59' })
  })

  it('fills in fields added over time', () => {
    const [person] = migratePersons([{ id: 'p1', nom: 'X', prenom: 'Y' }])
    expect(person).toMatchObject({ rank: '', notes: '', leaves: [], unavailable: false, unavailabilityNote: '' })
  })
})

describe('migrateVehicles — French schema', () => {
  const legacy = {
    id: '3001001',
    nom: 'Duro',
    immatriculation: 'M12345',
    categorie: 'moyen',
    statut: 'en prêt',
    commentairePret: 'Prêté à la cp EM',
    places: 8,
  }

  it('renames every field without losing a value', () => {
    const [vehicle] = migrateVehicles([legacy])
    expect(vehicle).toEqual({
      id: '3001001',
      name: 'Duro',
      plate: 'M12345',
      category: 'medium',
      status: 'on-loan',
      loanNote: 'Prêté à la cp EM',
      seats: 8,
    })
  })

  it('maps every historic category', () => {
    const categories = ['léger', 'léger-route', 'léger-tt', 'moyen', 'lourd']
    const migrated = migrateVehicles(categories.map((categorie, i) => ({ ...legacy, id: `v${i}`, categorie })))
    expect(migrated.map(v => v.category))
      .toEqual(['light-road', 'light-road', 'light-offroad', 'medium', 'heavy'])
  })

  it('drops the stored "en mission" status, which is now derived', () => {
    const [vehicle] = migrateVehicles([{ ...legacy, statut: 'en mission' }])
    expect(vehicle.status).toBe('free')
  })

  it('defaults the seat count', () => {
    const [vehicle] = migrateVehicles([{ id: 'v1', nom: 'X', categorie: 'moyen' }])
    expect(vehicle.seats).toBe(4)
  })
})

describe('migrateMissions — French schema', () => {
  const legacy = {
    id: '4001001',
    titre: 'Transport',
    description: 'Convoi',
    dateDebut: '2026-05-05T07:00',
    dateFin: '2026-05-09T18:00',
    notes: 'Colonne',
    vehicules: [{ id: 'r1', vehiculeId: '3001001', chauffeurId: '2001001', avecRemorque: true }],
    personnes: ['2001004'],
  }

  it('renames every field without losing a value', () => {
    const [mission] = migrateMissions([legacy])
    expect(mission).toEqual({
      id: '4001001',
      title: 'Transport',
      description: 'Convoi',
      startDate: '2026-05-05T07:00',
      endDate: '2026-05-09T18:00',
      notes: 'Colonne',
      vehicles: [{ id: 'r1', vehicleId: '3001001', driverId: '2001001', withTrailer: true }],
      staffIds: ['2001004'],
    })
  })

  it('leaves no French key behind', () => {
    const [mission] = migrateMissions([legacy])
    for (const key of ['titre', 'dateDebut', 'dateFin', 'vehicules', 'personnes']) {
      expect(mission).not.toHaveProperty(key)
    }
  })

  it('turns the oldest single-vehicle shape into a list', () => {
    const [mission] = migrateMissions([{
      id: 'm1', titre: 'X', dateDebut: '2026-05-05T07:00', dateFin: '2026-05-05T18:00',
      vehiculeId: '3001001', chauffeurId: '2001001',
    }])
    expect(mission.vehicles).toEqual([
      { id: 'mig-m1', vehicleId: '3001001', driverId: '2001001', withTrailer: false },
    ])
  })

  it('adds the default times to dateless missions', () => {
    const [mission] = migrateMissions([{ ...legacy, dateDebut: '2026-05-05', dateFin: '2026-05-09' }])
    expect(mission.startDate).toBe('2026-05-05T08:00')
    expect(mission.endDate).toBe('2026-05-09T17:00')
  })

  it('drops any stored status, which is derived from the dates', () => {
    const [mission] = migrateMissions([{ ...legacy, statut: 'en cours' }])
    expect(mission).not.toHaveProperty('statut')
    expect(mission).not.toHaveProperty('status')
  })
})

describe('idempotence', () => {
  it('leaves data already in the current schema untouched', () => {
    const persons = [{
      id: 'p1', rank: 'Sgt', firstName: 'A', lastName: 'B', licenses: ['930'],
      notes: '', leaves: [], unavailable: false, unavailabilityNote: '',
    }]
    const vehicles = [{
      id: 'v1', name: 'Duro', plate: 'M1', category: 'medium', status: 'free', loanNote: '', seats: 8,
    }]
    const missions = [{
      id: 'm1', title: 'T', description: '', startDate: '2026-09-02T08:00', endDate: '2026-09-02T17:00',
      notes: '', vehicles: [{ id: 'r1', vehicleId: 'v1', driverId: 'p1', withTrailer: false }], staffIds: [],
    }]

    expect(migratePersons(persons)).toEqual(persons)
    expect(migrateVehicles(vehicles)).toEqual(vehicles)
    expect(migrateMissions(missions)).toEqual(missions)
  })

  it('is stable when applied twice to legacy data', () => {
    const legacy = [{ id: 'p1', grade: 'Sgt', prenom: 'A', nom: 'B', permis: ['C'] }]
    const once = migratePersons(legacy)
    expect(migratePersons(once)).toEqual(once)
  })
})

describe('shipped demonstration data', () => {
  it('is already in the current schema', async () => {
    const { readFile } = await import('fs/promises')
    const read = async name =>
      JSON.parse(await readFile(new URL(`../../data.example/${name}.json`, import.meta.url), 'utf-8'))

    const persons = await read('persons')
    const vehicles = await read('vehicles')
    const missions = await read('missions')

    expect(migratePersons(persons)).toEqual(persons)
    expect(migrateVehicles(vehicles)).toEqual(vehicles)
    expect(migrateMissions(missions)).toEqual(missions)
  })
})
