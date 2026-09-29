import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { test } from 'node:test'

const capability = JSON.parse(fs.readFileSync('src-tauri/capabilities/default.json', 'utf8'))
const { formats } = JSON.parse(fs.readFileSync('shared/file-formats.json', 'utf8'))
const library = fs.readFileSync('src/views/LibraryMode.vue', 'utf8')
const media = fs.readFileSync('src/views/MediaViewerView.vue', 'utf8')

test('default media opener covers supported extensions, mixed case and external windows', () => {
  const permission = capability.permissions.find(p => p.identifier === 'opener:allow-open-path')
  assert.ok(permission)
  assert.ok(capability.windows.includes('main') && capability.windows.includes('external-*'))
  const allowed = value => permission.allow.some(scope => path.win32.matchesGlob(value, scope.path))
  for (const extension of formats.filter(f => f.routeName === 'MediaViewer').flatMap(f => f.extensions)) {
    assert.ok(allowed(`D:\\图片和视频\\sample${extension}`), extension)
    assert.ok(allowed(`D:\\图片和视频\\sample${extension.toUpperCase()}`), extension)
    assert.ok(allowed(`\\\\server\\share\\sample${extension}`), extension)
  }
  for (const extension of ['.exe', '.bat', '.cmd', '.ps1', '.lnk', '.mp4.exe']) {
    assert.equal(allowed(`D:\\sample${extension}`), false)
  }
  assert.ok(permission.allow.every(scope => scope.app === undefined || scope.app === null))
})

test('file manager action uses the existing reveal permission and handles failures', () => {
  const action = library.slice(library.indexOf("} else if (key === 'open-folder')"), library.indexOf("} else if (key === 'star')"))
  assert.match(action, /await revealItemInDir\(path\)/)
  assert.match(action, /catch \(error\)/)
  assert.match(action, /handleError\(/)
  assert.doesNotMatch(action, /openPath/)
  assert.ok(capability.permissions.includes('opener:default'))
})

test('a failed system open remains a recoverable media notice', async () => {
  const start = media.indexOf('const openExternally =')
  const end = media.indexOf('\n}', start) + 2
  const context = vm.createContext({ mediaPath: { value: 'D:/missing.mp4' }, playbackNotice: { value: '' },
    openPath: async () => { throw Error('missing application') } })
  vm.runInContext(media.slice(start, end) + '\nglobalThis.open = openExternally', context)
  await context.open()
  assert.match(context.playbackNotice.value, /missing application/)
  assert.match(context.playbackNotice.value, /播放器/)
})
