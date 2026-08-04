import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const capabilityPath = path.join(root, 'src-tauri', 'capabilities', 'default.json')
const sourceRoot = path.join(root, 'src')
const capability = JSON.parse(fs.readFileSync(capabilityPath, 'utf8'))
const permissions = new Set(capability.permissions || [])

const sourceFiles = []
const visit = directory => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) visit(target)
    else if (/\.(?:ts|vue)$/.test(entry.name)) sourceFiles.push(target)
  }
}
visit(sourceRoot)

const source = sourceFiles.map(file => fs.readFileSync(file, 'utf8')).join('\n')
const requirements = [
  { pattern: /window\.confirm\s*\(/, permission: 'dialog:allow-confirm', label: 'confirmation dialogs' },
  { pattern: /window\.alert\s*\(/, permission: 'dialog:allow-message', label: 'message dialogs' },
]

const missing = requirements.filter(requirement => (
  requirement.pattern.test(source)
  && !permissions.has('dialog:default')
  && !permissions.has(requirement.permission)
))

if (missing.length) {
  for (const requirement of missing) {
    console.error(`Missing ${requirement.permission} for ${requirement.label}.`)
  }
  process.exit(1)
}

console.log(`Dialog ACL check passed (${sourceFiles.length} source files scanned).`)
