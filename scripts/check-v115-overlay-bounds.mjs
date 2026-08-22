import fs from 'node:fs'

const normalize = value => value.replaceAll('\r\n', '\n')
const library = normalize(fs.readFileSync('src/views/LibraryMode.vue', 'utf8'))
const capture = normalize(fs.readFileSync('scripts/capture-v115-interaction-polish.mjs', 'utf8'))
const fail = message => { throw new Error(`v1.0.15 overlay-bounds contract rejected: ${message}`) }

for (const token of [
  '<n-dropdown\n                    trigger="click"\n                    scrollable',
  ':z-index="1000"',
  ':menu-props="templateMenuProps"',
  "class: 'library-create-dropdown-menu'",
  "style: 'max-height: min(520px, calc(100vh - 24px)); min-width: 188px;'",
]) if (!library.includes(token)) fail(`library create-menu token missing: ${token}`)

for (const token of [
  "readOverlayMetrics('.library-create-dropdown-menu')",
  'dropdownDarkNarrow.viewportHeight',
  'dropdownDarkNarrow.bottom > dropdownDarkNarrow.viewportHeight + 1',
  'dropdownLight.height > 520',
  'Number(dropdownLight.overlayOpacity) < 0.98',
]) if (!capture.includes(token)) fail(`desktop evidence token missing: ${token}`)

console.log('v1.0.15 overlay-bounds contract passed: the long create menu is scrollable, uniquely measurable and viewport bounded.')
