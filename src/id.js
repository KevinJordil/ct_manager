/**
 * Génération d'identifiants.
 *
 * `Date.now()` ne suffit pas : deux entités créées dans la même milliseconde
 * (une boucle, un double-clic) recevraient le même identifiant.
 */
export function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
