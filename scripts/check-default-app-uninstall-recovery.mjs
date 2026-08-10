import fs from 'node:fs'

const read = file => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
const registry = JSON.parse(read('shared/file-formats.json'))
const hooks = read('src-tauri/windows/nsis-hooks.nsh')
const system = read('src-tauri/src/commands/system.rs')
const failures = []

const candidateFormats = registry.formats.filter(format => ['edit', 'preview'].includes(format.externalPolicy))
const expectedExtensions = [...new Set(candidateFormats.flatMap(format => format.extensions))].sort()
const cleanupExtensions = [...hooks.matchAll(/!insertmacro LONGEDIT_REMOVE_RUNTIME_CANDIDATE "([^"]+)"/g)]
  .map(match => `.${match[1]}`)
  .sort()

if (candidateFormats.length !== 37) failures.push(`default-app candidate format count drift: ${candidateFormats.length}`)
if (expectedExtensions.length !== 85) failures.push(`default-app candidate extension count drift: ${expectedExtensions.length}`)
if (JSON.stringify(cleanupExtensions) !== JSON.stringify(expectedExtensions)) {
  const missing = expectedExtensions.filter(extension => !cleanupExtensions.includes(extension))
  const unexpected = cleanupExtensions.filter(extension => !expectedExtensions.includes(extension))
  failures.push(`NSIS runtime candidate cleanup drift; missing=${missing.join(',') || 'none'} unexpected=${unexpected.join(',') || 'none'}`)
}

for (const token of [
  '!macro LONGEDIT_REMOVE_RUNTIME_CANDIDATE EXT',
  'DeleteRegValue HKCU "Software\\Classes\\.${EXT}\\OpenWithProgids" "LongEdit.ExternalFile"',
  'DeleteRegKey HKCU "Software\\Classes\\LongEdit.ExternalFile"',
  'DeleteRegKey HKCU "Software\\LongEdit\\Capabilities"',
  'DeleteRegValue HKCU "Software\\RegisteredApplications" "LongEdit"',
]) {
  if (!hooks.includes(token)) failures.push(`NSIS runtime candidate cleanup is missing ${token}`)
}
if (hooks.includes('UserChoice') || system.includes('UserChoice')) failures.push('LongEdit must never mutate Windows UserChoice')
if (!system.includes('Software\\Classes\\{}\\OpenWithProgids') || !system.includes('Software\\RegisteredApplications')) {
  failures.push('runtime registration and uninstall recovery no longer target the same registry surfaces')
}

if (failures.length) {
  console.error(failures.map(failure => `- ${failure}`).join('\n'))
  process.exit(1)
}
console.log('EA-5B1 uninstall recovery passed: 37 candidate formats and 85 extensions clean only LongEdit-owned HKCU registrations.')
