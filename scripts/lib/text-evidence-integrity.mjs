import crypto from 'node:crypto'
import fs from 'node:fs'

const digest = content => crypto.createHash('sha256').update(content).digest('hex')

export const textEvidenceMatchesSha256 = (file, expected) => {
  const source = fs.readFileSync(file, 'utf8')
  const variants = [
    source,
    source.replace(/\r\n/g, '\n'),
    source.replace(/\r?\n/g, '\r\n'),
  ]
  return variants.some(content => digest(content) === expected)
}
