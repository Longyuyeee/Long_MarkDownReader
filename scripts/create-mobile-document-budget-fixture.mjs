import { mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { documentBudgetFixture } from './mobile-document-budget-fixture.mjs'
const directory = path.resolve(process.argv[2] || 'E:/Android/BuildCache/mobile-document-budget-fixture')
const fixture = documentBudgetFixture(), files = { 'Large.md': fixture.content, 'Small.md': fixture.small, 'Dense.md': fixture.dense, 'LongLine.txt': fixture.longLine }
await mkdir(path.join(directory, 'library'), { recursive: true })
const manifest = { kind: 'synthetic-mobile-document-budget-fixture', files: [] }
for (const [name, content] of Object.entries(files)) {
  await writeFile(path.join(directory, 'library', name), content)
  manifest.files.push({ name, bytes: Buffer.byteLength(content), sha256: createHash('sha256').update(content).digest('hex') })
}
await writeFile(path.join(directory, 'fixture-manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log(JSON.stringify(manifest))
