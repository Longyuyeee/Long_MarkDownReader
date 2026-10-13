// The user approved 1.1.0 as the next minor release above public 1.0.26.
// All other targets continue to require exactly the next patch version.
export function expectedDevelopmentTarget(publicVersion, requestedTarget) {
  if (!/^\d+\.\d+\.\d+$/.test(publicVersion)) throw new Error('Invalid public version')
  if (publicVersion === '1.0.26' && requestedTarget === '1.1.0') return '1.1.0'
  const [major, minor, patch] = publicVersion.split('.').map(Number)
  return `${major}.${minor}.${patch + 1}`
}
