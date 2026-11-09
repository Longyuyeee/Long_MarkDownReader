import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
const folder = process.argv[2]
assert.ok(folder && path.isAbsolute(folder), 'Pass an absolute new synthetic fixture directory')
await mkdir(folder) // Never overwrite a previous native fixture.
const files = {
  'Portable.md': '\ufeff# 带走这份文字😀\r\n\r\n电脑上继续写。\r混合换行保留。\n![图](attachments/example.png)\r\n最后一句。\r\n',
  'Plain.txt': '\ufeff纯文字中文😀\r\n第二行\n最后一句。\r'
}
const manifest = { kind: 'synthetic-text-export-source', files: {} }
for (const [name, content] of Object.entries(files)) { await writeFile(path.join(folder, name), content); manifest.files[name] = { content, bytes: Buffer.byteLength(content), sha256: createHash('sha256').update(content).digest('hex') } }
await writeFile(path.join(folder, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log(JSON.stringify(manifest, null, 2))
