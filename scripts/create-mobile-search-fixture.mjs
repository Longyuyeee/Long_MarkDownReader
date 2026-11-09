import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
const output = process.argv[2]
if (!output) throw new Error('Usage: node scripts/create-mobile-search-fixture.mjs OUTPUT_DIRECTORY (writes named test fixtures)')
const source = path.join(output, 'source'), updates = path.join(output, 'updates')
for (const folder of [source, path.join(source, 'nested'), path.join(source, '.hidden'), updates]) await mkdir(folder, { recursive: true })
const original = '# 移动端查找验收\n\nNativeSearchNeedle 中文与符号[ ]，这份笔记用于核对从查找打开后原文不变。\n'
const updated = '# 外部更新后的资料\n\nUpdatedNativeNeedle 外部已经更新，重新读取后应该找到这里。\n'
await writeFile(path.join(source, 'outline.md'), original)
await writeFile(path.join(source, 'nested/detail.txt'), '子目录也能找到 NativeSearchNeedle，原样查找不用记住文件名。\n')
await writeFile(path.join(source, 'source-hidden.md'), '# 链接中的命中\n\n[普通链接](https://example.invalid/SourceHiddenNeedle)\n')
await writeFile(path.join(source, '.hidden/hidden.md'), 'NativeSearchNeedle 不进入查找范围。\n')
await writeFile(path.join(source, 'sheet.csv'), 'NativeSearchNeedle,不搜索表格\n')
await writeFile(path.join(source, 'not-utf8.txt'), Buffer.from([0xff, 0xfe, 0x61]))
await writeFile(path.join(source, 'too-large.md'), Buffer.alloc(4 * 1024 * 1024 + 1, 0x61))
await writeFile(path.join(updates, 'outline.md'), updated)
console.log(JSON.stringify({ source, updates, initialMatches: 2, finalOriginalQueryMatches: 1, finalUpdatedQueryMatches: 1, excluded: ['.hidden', 'CSV'], readIssues: ['not-utf8.txt', 'too-large.md'] }, null, 2))
