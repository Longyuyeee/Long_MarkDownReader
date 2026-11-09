import { mkdir, readFile, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import path from 'node:path'
assert.ok(process.argv[2], 'Pass a dedicated test output directory; named fixture files will be replaced')
const directory = path.resolve(process.argv[2])
await mkdir(path.join(directory, 'notes'), { recursive: true }); await mkdir(path.join(directory, 'images'), { recursive: true })
const png = await readFile(new URL('../src-tauri/icons/128x128.png', import.meta.url))
const large = Buffer.from(png); large.writeUInt32BE(5000, 16); large.writeUInt32BE(3000, 20)
let crc = 0xffffffff
for (const byte of large.subarray(12, 29)) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0) }
large.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 29)
const note = '# Android reading check\n\n![Local picture](../images/picture.png)\n\n![Missing picture](missing.png)\n\nFirst target and second target and third target. 中文原文必须保留。\n\n' + Array.from({ length: 45 }, (_, i) => `## Section ${i + 1}\n\n中文阅读段落 ${i + 1}，旋转或重开后继续阅读。 Keep this paragraph intact.\n`).join('\n')
const limits = '# Image boundaries\n\n' + [
  ['Normal PNG', '../images/picture.png'], ['Large dimensions', '../images/large-dimensions.png'],
  ['Large bytes', '../images/oversized.png'], ['Invalid PNG', '../images/corrupt.png'],
  ['Active format', '../images/drawing.svg'], ['Outside library', '../../../outside.png'], ['Remote URL', 'https://example.invalid/image.png'],
].map(([alt, source]) => `![${alt}](${source})\n`).join('\n') + '\n正文必须继续可读。\n'
await Promise.all([
  writeFile(path.join(directory, 'notes/reading-note.md'), note), writeFile(path.join(directory, 'notes/image-limits.md'), limits),
  writeFile(path.join(directory, 'images/picture.png'), png), writeFile(path.join(directory, 'images/large-dimensions.png'), large),
  writeFile(path.join(directory, 'images/oversized.png'), Buffer.concat([png, Buffer.alloc(2 * 1024 * 1024 + 1 - png.length)])),
  writeFile(path.join(directory, 'images/corrupt.png'), 'not a PNG test fixture'),
])
console.log(JSON.stringify({ directory, files: 6, expected: ['normal relative PNG', 'missing image', 'pixel limit', 'byte limit', 'invalid image', 'unsupported and outside-root URLs', 'search and reading resume'] }, null, 2))
