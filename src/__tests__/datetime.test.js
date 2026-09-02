import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  toDateStr, toDateTimeStr, parseLocal, todayStr, nowStr,
  addDays, addMonths, mondayOf, overlaps, formatDT, addTimeIfMissing,
} from '../datetime.js'

afterEach(() => vi.useRealTimers())

describe('toDateStr / toDateTimeStr', () => {
  it('formate en heure locale, pas en UTC', () => {
    // Minuit local : toISOString() renverrait le jour précédent en Europe/Zurich.
    expect(toDateStr(new Date(2026, 0, 5, 0, 0))).toBe('2026-01-05')
    expect(toDateTimeStr(new Date(2026, 0, 5, 0, 0))).toBe('2026-01-05T00:00')
  })

  it('complète les nombres à deux chiffres', () => {
    expect(toDateTimeStr(new Date(2026, 8, 2, 9, 5))).toBe('2026-09-02T09:05')
  })
})

describe('parseLocal', () => {
  it('interprète les chaînes en heure locale', () => {
    const d = parseLocal('2026-09-02T08:30')
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()])
      .toEqual([2026, 8, 2, 8, 30])
  })

  it('accepte une date sans heure', () => {
    expect(toDateTimeStr(parseLocal('2026-09-02'))).toBe('2026-09-02T00:00')
  })

  it('fait l\'aller-retour avec toDateTimeStr', () => {
    const s = '2026-12-31T23:59'
    expect(toDateTimeStr(parseLocal(s))).toBe(s)
  })
})

describe('addDays', () => {
  it('avance d\'un jour', () => {
    expect(addDays('2026-09-02', 1)).toBe('2026-09-03')
  })

  it('recule d\'un jour', () => {
    expect(addDays('2026-09-02', -1)).toBe('2026-09-01')
  })

  it('avance d\'une semaine', () => {
    expect(addDays('2026-09-02', 7)).toBe('2026-09-09')
  })

  it('franchit les fins de mois et d\'année', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29') // année bissextile
  })

  it('reste juste au passage à l\'heure d\'été', () => {
    // Europe/Zurich : changement d'heure dans la nuit du 28 au 29 mars 2026.
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29')
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30')
    // ... et à l'heure d'hiver (25 octobre 2026).
    expect(addDays('2026-10-24', 1)).toBe('2026-10-25')
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26')
  })
})

describe('addMonths', () => {
  it('avance et recule d\'un mois', () => {
    expect(addMonths('2026-09-02', 1)).toBe('2026-10-02')
    expect(addMonths('2026-09-02', -1)).toBe('2026-08-02')
  })

  it('borne au dernier jour du mois cible', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28')
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29')
  })

  it('franchit l\'année', () => {
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15')
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-15')
  })
})

describe('mondayOf', () => {
  it('renvoie le lundi de la semaine', () => {
    // 2026-09-02 est un mercredi.
    expect(mondayOf('2026-09-02')).toBe('2026-08-31')
  })

  it('est stable sur un lundi', () => {
    expect(mondayOf('2026-08-31')).toBe('2026-08-31')
  })

  it('rattache le dimanche à la semaine qui s\'achève', () => {
    // 2026-09-06 est un dimanche : son lundi est le 31 août, pas le 7 septembre.
    expect(mondayOf('2026-09-06')).toBe('2026-08-31')
  })

  it('couvre les sept jours d\'une même semaine', () => {
    const semaine = ['2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03',
                     '2026-09-04', '2026-09-05', '2026-09-06']
    for (const jour of semaine) expect(mondayOf(jour)).toBe('2026-08-31')
  })
})

describe('overlaps', () => {
  it('détecte un chevauchement partiel', () => {
    expect(overlaps('2026-09-01T08:00', '2026-09-03T17:00',
                    '2026-09-02T08:00', '2026-09-04T17:00')).toBe(true)
  })

  it('détecte l\'inclusion', () => {
    expect(overlaps('2026-09-01T00:00', '2026-09-30T23:59',
                    '2026-09-10T08:00', '2026-09-11T17:00')).toBe(true)
  })

  it('rejette deux intervalles disjoints', () => {
    expect(overlaps('2026-09-01T08:00', '2026-09-02T17:00',
                    '2026-09-03T08:00', '2026-09-04T17:00')).toBe(false)
  })

  it('considère les bornes comme incluses', () => {
    expect(overlaps('2026-09-01T08:00', '2026-09-02T17:00',
                    '2026-09-02T17:00', '2026-09-03T08:00')).toBe(true)
  })

  it('renvoie false si une borne manque', () => {
    expect(overlaps(null, '2026-09-02T17:00', '2026-09-01T08:00', '2026-09-03T08:00')).toBe(false)
    expect(overlaps('2026-09-01T08:00', '2026-09-02T17:00', '', null)).toBe(false)
  })
})

describe('nowStr / todayStr', () => {
  it('rendent l\'heure locale, pas UTC', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 2, 9, 26)) // 09h26 locales
    expect(nowStr()).toBe('2026-09-02T09:26')
    expect(todayStr()).toBe('2026-09-02')
  })

  it('ne bascule pas de jour juste après minuit', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 2, 0, 30)) // 00h30 locales
    expect(todayStr()).toBe('2026-09-02')
  })
})

describe('formatDT', () => {
  it('formate une date-heure', () => {
    expect(formatDT('2026-04-28T09:00')).toBe('28.04.2026 09:00')
  })

  it('formate une date seule', () => {
    expect(formatDT('2026-04-28')).toBe('28.04.2026')
  })

  it('rend un tiret si la valeur est vide', () => {
    expect(formatDT('')).toBe('—')
    expect(formatDT(null)).toBe('—')
  })
})

describe('addTimeIfMissing', () => {
  it('ajoute l\'heure par défaut', () => {
    expect(addTimeIfMissing('2026-04-28', '08:00')).toBe('2026-04-28T08:00')
  })

  it('laisse intacte une date déjà horodatée', () => {
    expect(addTimeIfMissing('2026-04-28T14:30', '08:00')).toBe('2026-04-28T14:30')
  })

  it('laisse passer les valeurs vides', () => {
    expect(addTimeIfMissing('')).toBe('')
    expect(addTimeIfMissing(null)).toBe(null)
  })
})
