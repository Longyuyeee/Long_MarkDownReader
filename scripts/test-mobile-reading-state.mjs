import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { relativeImagePath, validReadingPoint, readBookmark, saveBookmark } from '../src/mobile/readingState.ts'

test('相对图片定位到当前笔记同级、子级与资料库内的上级', () => {
  assert.equal(relativeImagePath('阅读/笔记.md', 'images/示意%20图.PNG'), '阅读/images/示意 图.PNG')
  assert.equal(relativeImagePath('阅读/笔记.md', '../附件/图%23一.jpg?v=1#preview'), '附件/图#一.jpg')
  assert.equal(relativeImagePath('阅读/笔记.md', './images/../图.webp'), '阅读/图.webp')
})
test('不读取越界、网络、设备 URI、活动图像或无效编码', () => {
  for (const source of ['../../secret.png', '%2e%2e/%2e%2e/secret.png', '//host/a.png', '/sdcard/a.png', 'https://host/a.png', 'content://provider/a.png', 'file:///a.png', 'data:image/png;base64,a', 'x.svg', '../x\\a.png', 'x%00.png', '%ZZ.png']) {
    assert.equal(relativeImagePath('阅读/笔记.md', source), null, source)
  }
  assert.equal(relativeImagePath('阅读/笔记.md', '%252e%252e/a.png'), '阅读/%2e%2e/a.png', '只解码一次，不扩大授权范围')
})
test('阅读位置限定有效范围，不接受异常数值', () => {
  assert.ok(validReadingPoint({ block: 2, fraction: .3, progress: .7 }))
  for (const point of [null, {}, { block: -1, fraction: 0, progress: 0 }, { block: 1, fraction: Infinity, progress: 0 }, { block: 1, fraction: 0, progress: 2 }]) assert.equal(validReadingPoint(point), false)
})
test('不同资料库分别记录阅读位置，保留最近 100 条且拒绝损坏数据', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage'), memory = new Map()
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: k => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v) } })
  try {
    for (let index = 0; index < 105; index++) saveBookmark(`library-${index}/笔记.md`, `hash-${index}`, { block: index, fraction: .5, progress: .7 })
    const values = JSON.parse([...memory.values()][0]); assert.equal(Object.keys(values).length, 100)
    saveBookmark('other/笔记.md', 'different', { block: 2, fraction: .1, progress: .2 })
    assert.equal(readBookmark('other/笔记.md').fingerprint, 'different'); assert.equal(readBookmark('missing'), null)
    memory.set('longedit-mobile-reading-v1', '{broken'); assert.equal(readBookmark('other/笔记.md'), null)
  } finally { if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor); else delete globalThis.localStorage }
})
test('阅读控制器的实际代码摘要同时匹配页面及 Android CSP', () => {
  const script = readFileSync(new URL('../src/mobile/readerBridge.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
  const hash = createHash('sha256').update(script).digest('base64')
  const renderer = readFileSync(new URL('../src/mobile/readerDocument.ts', import.meta.url), 'utf8')
  const android = JSON.parse(readFileSync(new URL('../src-tauri/tauri.android.conf.json', import.meta.url), 'utf8'))
  assert.ok(renderer.includes(`READER_BRIDGE_HASH = '${hash}'`)); assert.ok(android.app.security.csp.includes(`'sha256-${hash}'`))
})
