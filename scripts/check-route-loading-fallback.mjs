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
  'requestAnimationFrame(() => requestAnimationFrame(finishOnce))',
  'setTimeout(finishOnce, 250)',
  'router.onError',
  'route-error-notice',
]) {
  if (!source.includes(token)) fail(`missing ${token}`)
}
if (!source.includes('let finished = false') || !source.includes('finished = true')) fail('fallback is not idempotent')
if (source.includes('page-loader') || source.includes('routeLoading')) fail('blocking route overlay still exists')
if (source.includes('mode="out-in"')) fail('route views still wait for the previous document to leave')

console.log('Route loading fallback passed: no blocking overlay exists and route failures remain recoverable.')
