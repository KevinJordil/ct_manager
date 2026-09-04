/**
 * What one person is engaged in.
 *
 * A soldier signing in asks a single question — where am I expected, and
 * with what — so this gathers the missions they appear in, in the order
 * those questions arise: what is running now, what comes next, what is over.
 */
import { MISSION_STATUS } from './constants.js'
import { getMissionStatus, missionInvolvesPerson } from './availability.js'
import { nowString } from './datetime.js'

/** The part somebody plays in one mission. */
export function roleInMission(mission, personId) {
  const driven = (mission.vehicles ?? []).filter(entry => entry.driverId === personId)
  return {
    driving: driven.map(entry => ({
      vehicleId: entry.vehicleId,
      withTrailer: Boolean(entry.withTrailer),
    })),
    // Somebody can drive one vehicle and be listed as crew as well.
    staff: (mission.staffIds ?? []).includes(personId),
  }
}

/**
 * The missions of one person, split by where they stand in time.
 *
 * Ongoing and upcoming read forwards — the next one first — while past ones
 * read backwards, since the question there is what happened last.
 */
export function missionsOfPerson(missions, personId, now = nowString()) {
  const groups = { ongoing: [], upcoming: [], past: [] }
  if (!personId) return groups

  for (const mission of missions) {
    if (!missionInvolvesPerson(mission, personId)) continue
    const status = getMissionStatus(mission, now)
    const entry = { ...mission, status, role: roleInMission(mission, personId) }
    if (status === MISSION_STATUS.ONGOING) groups.ongoing.push(entry)
    else if (status === MISSION_STATUS.PLANNED) groups.upcoming.push(entry)
    else groups.past.push(entry)
  }

  const byStart = (a, b) => a.startDate.localeCompare(b.startDate)
  groups.ongoing.sort(byStart)
  groups.upcoming.sort(byStart)
  groups.past.sort((a, b) => b.startDate.localeCompare(a.startDate))
  return groups
}

/** How many missions are running or still to come. */
export function pendingCount(groups) {
  return groups.ongoing.length + groups.upcoming.length
}
