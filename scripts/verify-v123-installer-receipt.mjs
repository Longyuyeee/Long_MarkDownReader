import fs from 'node:fs'
import path from 'node:path'
import { verifyV123InstallerReceipt } from './lib/v123-installer-receipt.mjs'

const [rootArg, ...extra] = process.argv.slice(2)
if (!rootArg || extra.length) throw new Error('Usage: node scripts/verify-v123-installer-receipt.mjs <extracted-artifact-root>')
const root = fs.realpathSync(rootArg)
const entries = new Map()
function scan(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name)
    if (entry.isSymbolicLink()) throw new Error('Artifact symlinks are not accepted')
    if (entry.isDirectory()) scan(file)
    else if (entry.isFile()) {
      if (!entries.has(entry.name)) entries.set(entry.name, [])
      entries.get(entry.name).push(file)
    }
  }
}
scan(root)
const readOne = name => {
  const matches = entries.get(name) ?? []
  if (matches.length !== 1) throw new Error(`Expected one artifact file: ${name}; found ${matches.length}`)
  return fs.readFileSync(matches[0])
}
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const policy = json('shared/v123-candidate-lifecycle-policy.json')
const result = verifyV123InstallerReceipt(JSON.parse(readOne('installer-build-receipt.json').toString('utf8')), policy, json(policy.previousReleaseReceipt), readOne)
console.log(JSON.stringify(result, null, 2))
