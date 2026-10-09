/**
 * Runtime configuration: the parts of the domain an operator may adjust
 * without a redeploy.
 *
 * Only language-independent data is configurable — licence codes and the
 * matrix saying which licence allows which vehicle category. Vehicle
 * categories themselves are fixed: they follow the Swiss regulation and the
 * whole availability logic is built on them.
 *
 * Request vehicle types can be extended: a built-in entry keeps its
 * translations, while an entry added here carries a plain label used as-is
 * in every language.
 */

import {
  LICENSES, LICENSES_BY_CATEGORY, TRAILER_LICENSES_BY_CATEGORY,
  REQUEST_VEHICLE_TYPES, VEHICLE_CATEGORIES,
} from './constants.js'

export const DEFAULT_CONFIG = {
  requestVehicleTypes: REQUEST_VEHICLE_TYPES.map(id => ({ id })),
  licenses: [...LICENSES],
  licensesByCategory: { ...LICENSES_BY_CATEGORY },
  trailerLicensesByCategory: { ...TRAILER_LICENSES_BY_CATEGORY },
}

/** Built-in request types carry a translation; custom ones carry a label. */
export function isBuiltInRequestType(id) {
  return REQUEST_VEHICLE_TYPES.includes(id)
}

/**
 * Merges stored overrides onto the defaults, field by field: a partial or
 * older file still yields a complete, usable configuration.
 */
export function withDefaults(stored = {}) {
  return {
    requestVehicleTypes: normaliseTypes(stored.requestVehicleTypes),
    licenses: Array.isArray(stored.licenses) && stored.licenses.length
      ? [...stored.licenses]
      : [...DEFAULT_CONFIG.licenses],
    licensesByCategory: mergeMatrix(stored.licensesByCategory, DEFAULT_CONFIG.licensesByCategory),
    trailerLicensesByCategory: mergeMatrix(
      stored.trailerLicensesByCategory, DEFAULT_CONFIG.trailerLicensesByCategory),
  }
}

function normaliseTypes(types) {
  if (!Array.isArray(types) || types.length === 0) {
    return DEFAULT_CONFIG.requestVehicleTypes.map(type => ({ ...type }))
  }
  return types
    .filter(type => type && typeof type.id === 'string' && type.id !== '')
    .map(type => (type.label ? { id: type.id, label: type.label } : { id: type.id }))
}

function mergeMatrix(stored, defaults) {
  const merged = {}
  for (const category of VEHICLE_CATEGORIES) {
    merged[category] = Array.isArray(stored?.[category])
      ? [...stored[category]]
      : [...defaults[category]]
  }
  return merged
}
