import { mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
const directory = process.argv[2]
if (!directory || !path.isAbsolute(directory)) throw new Error('Provide an absolute new fixture directory')
await mkdir(directory); await mkdir(path.join(directory, 'files'))
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7N8AAAAASUVORK5CYII=', 'base64')
const files = { 'Portable.md': Buffer.from('\ufeff# Portable 中文😀\r\n![图](files/%E5%9B%BE%20%23.png)\r[资料](files/a.pdf#page=2)\n[空文件](files/empty.pdf)\r\n[同一图](files/%E5%9B%BE%20%23.png)\r\n'), 'files/图 #.png': png, 'files/a.pdf': Buffer.from([0,1,255,0,10,13]), 'files/empty.pdf': Buffer.alloc(0), 'Missing.md': Buffer.from('# 缺失附件\n![图](files/missing.png)\n') }
const manifest = {}
for (const [name, bytes] of Object.entries(files)) { await writeFile(path.join(directory, name), bytes); manifest[name] = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), base64: bytes.toString('base64') } }
await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log(directory)
