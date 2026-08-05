import fs from 'node:fs'

const source = fs.readFileSync('src/components/WorkspaceTabs.vue', 'utf8')
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const fail = message => { throw new Error(`UX-38B workspace tabs rejected: ${message}`) }

for (const token of [
  'ref="scrollRef"',
  '@wheel="handleWheel"',
  '@scroll="updateScrollState"',
  '向左浏览标签',
  '向右浏览标签',
  'const handleWheel = (event: WheelEvent)',
  'Math.abs(event.deltaX) > Math.abs(event.deltaY)',
  'event.preventDefault()',
  "scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })",
  '@keydown.left.prevent="focusAdjacentTab(tab, -1)"',
  '@keydown.right.prevent="focusAdjacentTab(tab, 1)"',
  'new ResizeObserver(updateScrollState)',
  'resizeObserver?.disconnect()',
  'flex: 0 0 176px',
  'min-width: 156px',
  'scrollbar-width: none',
  '.workspace-tabs-scroll::-webkit-scrollbar',
]) if (!source.includes(token)) fail(`contract token missing: ${token}`)

if (/scrollbar-width:\s*(thin|auto)/.test(source)) fail('native scrollbar styling returned')
if (/min-width:\s*92px/.test(source)) fail('compressed 92px tab width returned')
if (!packageJson.scripts?.['check:ux38b-workspace-tabs']) fail('package checker command missing')
if (!packageJson.scripts?.['check:current-development-audit']?.includes('check-ux38b-workspace-tabs-contract')) fail('checker is outside the development audit chain')

console.log('UX-38B workspace tabs contract passed: readable fixed-width tabs, hidden native tracks, wheel/touchpad scrolling, edge controls, active reveal, and keyboard navigation are present.')
