/**
 * In-memory rate limiting, per client and per purpose.
 *
 * Enough for a single-process deployment, which is what this application is.
 * Behind several instances the counters would not be shared, and a real
 * store would be needed.
 */

export function createRateLimiter({ windowMs, max, now = () => Date.now() } = {}) {
  const hits = new Map() // client key → timestamps inside the window

  function recent(key, current) {
    return (hits.get(key) ?? []).filter(at => current - at < windowMs)
  }

  /** Records an attempt. @returns {boolean} true when the client is over budget */
  function hit(key) {
    const current = now()
    const times = recent(key, current)
    if (times.length >= max) {
      hits.set(key, times)
      return true
    }
    times.push(current)
    hits.set(key, times)

    // Keep the map from growing without bound on a long-running server.
    if (hits.size > 10_000) {
      for (const [client, stamps] of hits) {
        if (!stamps.some(at => current - at < windowMs)) hits.delete(client)
      }
    }
    return false
  }

  /** Clears a client's budget — used when an attempt turns out to be legitimate. */
  function reset(key) {
    hits.delete(key)
  }

  /** Seconds the client has to wait before trying again. */
  function retryAfter(key) {
    const current = now()
    const times = recent(key, current)
    if (times.length < max) return 0
    return Math.ceil((windowMs - (current - times[0])) / 1000)
  }

  return { hit, reset, retryAfter, size: () => hits.size }
}
