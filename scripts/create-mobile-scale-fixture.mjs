import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const output = process.argv[2] || 'E:/Android/BuildCache/mobile-scale-fixture'
await mkdir(output, { recursive: true })
const library = path.join(output, 'library')
await mkdir(library, { recursive: true })
const files = []
for (let i = 0; i < 1000; i++) {
  const name = `Note-${String(i).padStart(4, '0')}.md`
  const content = `# Mobile scale ${i}\n\nNativeScaleBody${String(i).padStart(4, '0')}\n\n` + '本机资料库规模验收，仅包含合成文字。'.repeat(30) + '\n'
  const bytes = Buffer.from(content)
  await writeFile(path.join(library, name), bytes)
  files.push({ name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })
}
await writeFile(path.join(output, 'fixture-manifest.json'), JSON.stringify({ kind: 'synthetic-mobile-library-scale', count: files.length, textBytes: files.reduce((sum, file) => sum + file.bytes, 0), files }, null, 2) + '\n')
console.log(JSON.stringify({ output, count: files.length, textBytes: files.reduce((sum, file) => sum + file.bytes, 0) }))
