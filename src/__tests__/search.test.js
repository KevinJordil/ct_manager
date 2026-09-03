import { describe, it, expect } from 'vitest'
import { queryTerms, matchesTerms, filterBySearch } from '../search.js'

describe('queryTerms', () => {
  it('splits on whitespace and lowercases', () => {
    expect(queryTerms('  Duro  M123 ')).toEqual(['duro', 'm123'])
  })

  it('strips accents, so the keyboard layout does not matter', () => {
    expect(queryTerms('Müller Élise')).toEqual(['muller', 'elise'])
  })

  it('returns nothing for an empty query', () => {
    expect(queryTerms('')).toEqual([])
    expect(queryTerms('   ')).toEqual([])
  })
})

describe('matchesTerms', () => {
  const person = ['Sgt', 'Andreas', 'Müller', ['930', '930E']]

  it('matches regardless of accents and case', () => {
    expect(matchesTerms(person, queryTerms('muller'))).toBe(true)
    expect(matchesTerms(person, queryTerms('MÜLLER'))).toBe(true)
  })

  it('requires every word, in any order', () => {
    expect(matchesTerms(person, queryTerms('muller 930'))).toBe(true)
    expect(matchesTerms(person, queryTerms('930 andreas'))).toBe(true)
    expect(matchesTerms(person, queryTerms('muller 999'))).toBe(false)
  })

  it('looks inside nested lists', () => {
    expect(matchesTerms(person, queryTerms('930e'))).toBe(true)
  })

  it('matches everything on an empty query', () => {
    expect(matchesTerms(person, [])).toBe(true)
  })

  it('ignores empty and missing values', () => {
    expect(matchesTerms(['A', null, undefined, '', 'B'], queryTerms('b'))).toBe(true)
  })
})

describe('filterBySearch', () => {
  const vehicles = [
    { name: 'Duro', plate: 'M12345' },
    { name: 'Puch', plate: 'M54321' },
    { name: 'Camion 6x6', plate: 'M99999' },
  ]
  const fields = vehicle => [vehicle.name, vehicle.plate]

  it('returns everything on an empty query', () => {
    expect(filterBySearch(vehicles, '', fields)).toHaveLength(3)
    expect(filterBySearch(vehicles, '  ', fields)).toHaveLength(3)
  })

  it('filters on any field', () => {
    expect(filterBySearch(vehicles, 'duro', fields).map(v => v.name)).toEqual(['Duro'])
    expect(filterBySearch(vehicles, 'M999', fields).map(v => v.name)).toEqual(['Camion 6x6'])
  })

  it('matches a fragment, not only a whole word', () => {
    expect(filterBySearch(vehicles, 'cam', fields)).toHaveLength(1)
  })

  it('returns nothing when no record matches', () => {
    expect(filterBySearch(vehicles, 'tracteur', fields)).toEqual([])
  })

  it('does not mutate the list it is given', () => {
    const copy = [...vehicles]
    filterBySearch(vehicles, 'duro', fields)
    expect(vehicles).toEqual(copy)
  })
})
