import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
const directory = path.resolve(process.argv[2] || 'release-artifacts/mobile-writing-fixture')
await mkdir(directory, { recursive: true })
await writeFile(path.join(directory, 'Writing.md'), '# 拼音输入验收\r\n\r\nNativeWritingBody\r\n\r\n')
await writeFile(path.join(directory, 'Landscape.md'), '# 字号与横屏\n\n' + Array.from({ length: 40 }, (_, i) => `## 第 ${i + 1} 段\n\n横屏和字号变化后仍能接着阅读、选文和编辑。测试段落 ${i + 1}。\n`).join('\n'))
console.log(directory)
