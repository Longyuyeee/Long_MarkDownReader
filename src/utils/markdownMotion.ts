/** Two sustained one-second slow windows, after initial rendering has settled. */
export function createMarkdownFrameMonitor(onSlow: () => void) {
  let previous = 0, warmUntil = 0, windowStart = 0, samples = 0, slow = 0, badWindows = 0
  let triggered = false
  const reset = (now: number) => {
    previous = now
    warmUntil = now + 1500
    windowStart = warmUntil
    samples = slow = badWindows = 0
    triggered = false
  }
  const frame = (now: number) => {
    if (triggered) return
    const elapsed = now - previous
    previous = now
    if (now < warmUntil) return
    samples++
    if (elapsed > 34) slow++
    if (now - windowStart < 1000) return
    // A single expensive operation is not sustained animation pressure.
    const sustained = (slow >= 4 && slow / samples >= 0.25) || (samples <= 2 && elapsed >= 500)
    badWindows = sustained ? badWindows + 1 : 0
    windowStart = now
    samples = slow = 0
    if (badWindows >= 2) { triggered = true; onSlow() }
  }
  return { reset, frame }
}
