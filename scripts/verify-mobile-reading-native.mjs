import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
const args = process.argv.slice(2), options = Object.fromEntries(args.reduce((pairs, value, index) => { if (index % 2 === 0) pairs.push([value.replace(/^--/, ''), args[index + 1]]); return pairs }, []))
assert.ok(options.serial && options['fixture-dir'] && options.output, 'Required: --serial --fixture-dir --output')
const basename = path.basename(path.resolve(options['fixture-dir']))
assert.match(basename, /^[a-zA-Z0-9_-]+$/, 'Use a dedicated fixture directory with an ASCII name')
const command = (...commandArgs) => {
  const result = spawnSync(options.adb || 'E:/Android/Sdk/platform-tools/adb.exe', ['-s', options.serial, ...commandArgs], { maxBuffer: 8 * 1024 * 1024 })
  assert.equal(result.status, 0, result.stderr?.toString() || 'ADB read failed'); return result.stdout
}
const hashes = []
for (const file of ['notes/reading-note.md', 'notes/image-limits.md', 'images/picture.png']) {
  const expected = await readFile(path.join(options['fixture-dir'], file)), actual = command('exec-out', 'cat', `/sdcard/Documents/${basename}/${file}`)
  assert.deepEqual(actual, expected, `Original fixture changed: ${file}`)
  hashes.push({ file, sha256: createHash('sha256').update(actual).digest('hex'), bytes: actual.length })
}
const before = await readFile(path.join(options.output, 'before-stop.xml'), 'utf8'), after = await readFile(path.join(options.output, 'after-stop.xml'), 'utf8')
function visibleSections(xml) {
  return [...xml.matchAll(/<node\b[^>]*>/g)].flatMap(([tag]) => {
    const text = /text="Section (\d+)"/.exec(tag), bounds = /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(tag)
    if (!text || !bounds) return []
    const [, x1, y1, x2, y2] = bounds.map(Number)
    return x2 > x1 && y2 > y1 && y2 > 420 && y1 < 2150 ? [Number(text[1])] : []
  })
}
const beforeSections = visibleSections(before), afterSections = visibleSections(after)
assert.ok(beforeSections[0] >= 4, 'Scroll far enough before force-stop to verify a meaningful resumed position')
assert.equal(beforeSections[0], afterSections[0]); assert.ok(after.includes('已接着上次的阅读位置'))
for (const [file, mode] of [['search-second-final.xml', '阅读内容查找'], ['source-search-second.xml', '源码内查找']]) {
  const xml = await readFile(path.join(options.output, file), 'utf8')
  assert.ok(xml.includes(mode) && xml.includes('2 / 3') && xml.includes('已保存到文件'), `${mode}: navigation and unchanged source status must be visible`)
}
const limits = await readFile(path.join(options.output, 'image-limits.xml'), 'utf8')
for (const text of ['3 张图片未加载', '图片分辨率超过当前阅读限制', '图片支持 2 MiB 以内的文件', '图片内容无法识别', '仅支持资料库内的 PNG、JPEG、WebP 相对图片']) assert.ok(limits.includes(text), `Missing native boundary response: ${text}`)
const prefs = command('exec-out', 'run-as', 'com.longyuye.mdreader.mobile.dev', 'cat', 'shared_prefs/longedit-mobile-roots-v1.xml').toString('utf8')
const root = [...prefs.matchAll(/<string name="([a-f0-9]{64})">([^<]+)<\/string>/g)].find(([, , uri]) => uri.endsWith(basename))
assert.ok(root, 'Fixture tree registration missing')
const draftId = createHash('sha256').update(`${root[1]}\nnotes/reading-note.md`).digest('hex')
const drafts = command('exec-out', 'run-as', 'com.longyuye.mdreader.mobile.dev', 'ls', 'files/drafts-v1').toString('utf8')
assert.ok(!drafts.includes(`${draftId}.json`), 'Undo and navigation should not leave obsolete test input as a recoverable draft')
const report = { kind: 'android-reading-byte-and-ui-evidence-verification', checkedAt: new Date().toISOString(), serial: options.serial, passed: true,
  hashes, beforeSections, afterSections, checks: ['source Markdown and PNG unchanged byte-for-byte', 'same visible section after force-stop and cold reopen', 'rendered and source search navigate to 2 of 3 matches', 'native image byte/pixel/type limits reported', 'obsolete undone test draft removed'],
  limits: ['UI operations performed separately by ADB accessibility helper', 'PNG positive decoding tested; JPEG/WebP positive samples still pending', 'no physical phone or Chinese IME composition test'] }
await writeFile(path.join(options.output, 'verification.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
