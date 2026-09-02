/** Domain vocabulary shared by the client and the server. */

/** Mission status, always derived from its dates — never stored. */
export const MISSION_STATUS = {
  PLANNED: 'planned',
  ONGOING: 'ongoing',
  COMPLETED: 'completed',
}

/** Person status shown in the interface. */
export const PERSON_STATUS = {
  AVAILABLE: 'available',
  ON_MISSION: 'on-mission',
  ON_LEAVE: 'on-leave',
  UNAVAILABLE: 'unavailable',
}

/** Vehicle status shown in the interface. */
export const VEHICLE_STATUS = {
  FREE: 'free',
  ON_MISSION: 'on-mission',
  ON_LOAN: 'on-loan',
}

/** Only these two are stored; 'on-mission' is derived from the missions. */
export const STORED_VEHICLE_STATUSES = [VEHICLE_STATUS.FREE, VEHICLE_STATUS.ON_LOAN]

export const VEHICLE_CATEGORY = {
  LIGHT_ROAD: 'light-road',
  LIGHT_OFFROAD: 'light-offroad',
  MEDIUM: 'medium',
  HEAVY: 'heavy',
}

export const VEHICLE_CATEGORIES = Object.values(VEHICLE_CATEGORY)

/** Swiss military driving licences, kept as their official codes. */
export const LICENSES = ['920', '920E', '921', '921E', '930', '930E', '931', '931E']

/** Licences allowing a category to be driven, without a trailer. */
export const LICENSES_BY_CATEGORY = {
  [VEHICLE_CATEGORY.LIGHT_ROAD]: ['921', '921E', '920', '920E', '931', '931E', '930', '930E'],
  [VEHICLE_CATEGORY.LIGHT_OFFROAD]: ['920', '920E', '931', '931E', '930', '930E'],
  [VEHICLE_CATEGORY.MEDIUM]: ['931', '931E', '930', '930E'],
  [VEHICLE_CATEGORY.HEAVY]: ['930', '930E'],
}

/** Licences required when a trailer is towed — the "E" ones only. */
export const TRAILER_LICENSES_BY_CATEGORY = {
  [VEHICLE_CATEGORY.LIGHT_ROAD]: ['921E', '920E', '931E', '930E'],
  [VEHICLE_CATEGORY.LIGHT_OFFROAD]: ['920E', '931E', '930E'],
  [VEHICLE_CATEGORY.MEDIUM]: ['931E', '930E'],
  [VEHICLE_CATEGORY.HEAVY]: ['930E'],
}

/** Collections persisted by the API. */
export const ENTITIES = ['persons', 'vehicles', 'missions']
