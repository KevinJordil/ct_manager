/**
 * Who did what, and when, as the server saw it.
 *
 * Key movements and weekly checks are open to every account, so the client
 * cannot be trusted to say who recorded them or at what time: an account
 * could otherwise backdate a movement, or sign it with somebody else's name.
 * New entries are stamped here; entries already stored cannot be rewritten.
 */

/**
 * Stamps the new key movements and checks of a submitted fleet, and restores
 * the stored version of every entry that already existed.
 *
 * @param stored    the fleet currently on disk
 * @param submitted the fleet received, modified in place
 * @param stamp     {{recordedBy: string, recordedById: string, at: string}}
 */
export function stampVehicles(stored, submitted, { recordedBy, recordedById, at }) {
  const previous = new Map(stored.map(vehicle => [vehicle.id, vehicle]))

  for (const vehicle of submitted) {
    const before = previous.get(vehicle.id)

    const knownMovements = new Map((before?.keyHistory ?? []).map(entry => [entry.id, entry]))
    let moved = false
    if (vehicle.keyHistory) {
      vehicle.keyHistory = vehicle.keyHistory.map(entry => {
        const known = knownMovements.get(entry.id)
        // A later movement may close an earlier one; nothing else changes.
        if (known) return { ...known, closedBy: known.closedBy || entry.closedBy || '' }
        moved = true
        return { ...entry, at, recordedBy }
      })
    }

    if (vehicle.keyHolder) {
      // The holder dates from the movement that handed the key over.
      vehicle.keyHolder = moved || !before?.keyHolder
        ? { ...vehicle.keyHolder, since: at, recordedBy }
        : { ...vehicle.keyHolder, since: before.keyHolder.since, recordedBy: before.keyHolder.recordedBy }
    }

    const knownChecks = new Map((before?.checks ?? []).map(check => [check.id, check]))
    if (vehicle.checks) {
      vehicle.checks = vehicle.checks.map(check => knownChecks.get(check.id)
        ?? { ...check, recordedBy, recordedById })
    }
  }
  return submitted
}
