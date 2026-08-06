import crypto from 'node:crypto'
import fs from 'node:fs'

const digest = content => crypto.createHash('sha256').update(content).digest('hex')

export const textEvidenceMatchesSha256 = (file, expected) => {
  const source = fs.readFileSync(file, 'utf8')
  const normalized = source.replace(/\r\n/g, '\n')
  const legacyPowerShell = normalized.endsWith('\n')
    ? `${normalized.slice(0, -1).replace(/\n/g, '\r\n')}\n`
    : normalized.replace(/\n/g, '\r\n')
  const variants = [
    source,
    normalized,
    normalized.replace(/\n/g, '\r\n'),
    legacyPowerShell,
  ]
  return variants.some(content => digest(content) === expected)
}
