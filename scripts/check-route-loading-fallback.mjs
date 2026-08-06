import fs from 'node:fs'

const source = fs.readFileSync('src/App.vue', 'utf8')
const fail = message => {
  console.error(`Route loading fallback rejected: ${message}`)
  process.exit(1)
}

for (const token of [
  'let routeMeasurementSequence = 0',
  'routeMeasurementSequence += 1',
  'if (sequence !== routeMeasurementSequence) return',
  'finishInitialAppLoading()',
  'requestAnimationFrame(() => requestAnimationFrame(finishOnce))',
  'setTimeout(finishOnce, 250)',
]) {
  if (!source.includes(token)) fail(`missing ${token}`)
}
if (!source.includes('let finished = false') || !source.includes('finished = true')) fail('fallback is not idempotent')
if (source.includes('routeLoading.value = true')) fail('document navigation can reactivate the blocking overlay')
if (source.includes('mode="out-in"')) fail('route views still wait for the previous document to leave')

console.log('Route loading fallback passed: startup feedback is bounded while document navigation remains non-blocking.')
