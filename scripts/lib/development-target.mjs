// Explicitly approved minor transitions retain their real public predecessor.
export function expectedDevelopmentTarget(publicVersion, requestedTarget) {
  if (!/^\d+\.\d+\.\d+$/.test(publicVersion)) throw new Error('Invalid public version')
  if (publicVersion === '1.0.26' && requestedTarget === '1.1.0') return '1.1.0'
  if (publicVersion === '1.1.37' && requestedTarget === '1.2.0') return '1.2.0'
  const [major, minor, patch] = publicVersion.split('.').map(Number)
  return `${major}.${minor}.${patch + 1}`
}
