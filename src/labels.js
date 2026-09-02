/** Display helpers shared by several components. */

/** "Sgt Andreas Müller" — rank is optional */
export function personName(person) {
  if (!person) return '—'
  return [person.rank, person.firstName, person.lastName].filter(Boolean).join(' ')
}

/** Badge colours per Swiss military driving licence. */
export const LICENSE_COLORS = {
  '920': 'bg-sky-100 text-sky-700',
  '920E': 'bg-sky-200 text-sky-800',
  '921': 'bg-teal-100 text-teal-700',
  '921E': 'bg-teal-200 text-teal-800',
  '930': 'bg-violet-100 text-violet-700',
  '930E': 'bg-violet-200 text-violet-800',
  '931': 'bg-orange-100 text-orange-700',
  '931E': 'bg-orange-200 text-orange-800',
}

export const LICENSE_PICKER_COLORS = {
  '920': 'bg-sky-100 text-sky-700 border-sky-300',
  '920E': 'bg-sky-200 text-sky-800 border-sky-400',
  '921': 'bg-teal-100 text-teal-700 border-teal-300',
  '921E': 'bg-teal-200 text-teal-800 border-teal-400',
  '930': 'bg-violet-100 text-violet-700 border-violet-300',
  '930E': 'bg-violet-200 text-violet-800 border-violet-400',
  '931': 'bg-orange-100 text-orange-700 border-orange-300',
  '931E': 'bg-orange-200 text-orange-800 border-orange-400',
}
