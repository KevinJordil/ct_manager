/**
 * Text search over records.
 *
 * Comparison ignores case and accents: typing "muller" has to find "Müller",
 * and "eleve" has to find "élevé". Every word of the query must appear
 * somewhere in the record, in any order, so "muller 930" works.
 */

function normalise(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

/** Splits a query into the words that must all be found. */
export function queryTerms(query) {
  return normalise(query).split(/\s+/).filter(Boolean)
}

/**
 * @param values the searchable fields of one record, in any shape
 * @param terms  the output of queryTerms
 */
export function matchesTerms(values, terms) {
  if (terms.length === 0) return true
  const haystack = normalise(values.flat(Infinity).filter(Boolean).join(' '))
  return terms.every(term => haystack.includes(term))
}

/**
 * Filters a list.
 * @param fieldsOf returns the searchable values of one record
 */
export function filterBySearch(items, query, fieldsOf) {
  const terms = queryTerms(query)
  if (terms.length === 0) return items
  return items.filter(item => matchesTerms(fieldsOf(item), terms))
}
