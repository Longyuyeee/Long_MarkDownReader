import fs from 'node:fs'

const source = fs.readFileSync('src/App.vue', 'utf8')
const fail = message => {
  console.error(`Route loading fallback rejected: ${message}`)
  process.exit(1)
}

for (const token of [
  'let routeLoadingSequence = 0',
  'routeLoadingSequence += 1',
  'if (sequence !== routeLoadingSequence) return',
  'requestAnimationFrame(() => requestAnimationFrame(finishOnce))',
  'setTimeout(finishOnce, 250)',
]) {
  if (!source.includes(token)) fail(`missing ${token}`)
}
if (!source.includes('let finished = false') || !source.includes('finished = true')) fail('fallback is not idempotent')

console.log('Route loading fallback passed: occluded WebView2 windows cannot leave the navigation overlay pending indefinitely.')
