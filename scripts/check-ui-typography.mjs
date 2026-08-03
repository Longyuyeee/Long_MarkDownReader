import fs from 'node:fs'
import path from 'node:path'

const failures = []
const styleFiles = []

const walk = directory => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name)
    if (entry.isDirectory()) walk(filePath)
    else if (/\.(?:vue|scss|css)$/.test(entry.name)) styleFiles.push(filePath)
  }
}

walk('src')

let undersizedCount = 0
for (const filePath of styleFiles) {
  const source = fs.readFileSync(filePath, 'utf8')
  const declarations = [...source.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)]
  for (const declaration of declarations) {
    const size = Number(declaration[1])
    if (size >= 11) continue
    undersizedCount += 1
    const line = source.slice(0, declaration.index).split('\n').length
    failures.push(`${filePath}:${line} uses an unregistered ${size}px UI font`)
  }
}

const tokens = fs.readFileSync('src/styles/tokens.scss', 'utf8')
for (const token of ['--text-compact: 11px', '--text-sm: 12px', '--text-base: 13px']) {
  if (!tokens.includes(token)) failures.push(`typography token is missing: ${token}`)
}

if (failures.length) {
  console.error(failures.join('\n'))
  process.exit(1)
}

console.log(`UI typography contract passed: ${styleFiles.length} style sources scanned, ${undersizedCount} unregistered fonts.`)
