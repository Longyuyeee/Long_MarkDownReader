import fs from 'node:fs'

const view = fs.readFileSync('src/views/MediaViewerView.vue', 'utf8')
const required = [
  ['@wheel="handleImageWheel"', 'wheel zoom binding'],
  ['@pointerdown="handlePanStart"', 'pointer pan binding'],
  ['@pointermove="handlePanMove"', 'pointer move binding'],
  ['@pointercancel="handlePanEnd"', 'pointer cancellation binding'],
  ['@dblclick="handleImageDoubleClick"', 'double-click view toggle'],
  ['Math.exp(-normalizedWheelDelta(event) * 0.0015)', 'smooth wheel scaling'],
  ['anchorX * stage.scrollWidth - viewportX', 'cursor anchor restoration'],
  ['stage.setPointerCapture(event.pointerId)', 'stable pointer capture'],
  ['stage.scrollLeft = panOrigin.scrollLeft', 'horizontal pan'],
  ['stage.scrollTop = panOrigin.scrollTop', 'vertical pan'],
  ['class="image-pan-surface"', 'scrollable image surface'],
  ['overscroll-behavior: contain', 'wheel containment'],
  ["event.key === 'ArrowLeft'", 'keyboard pan fallback'],
]
const missing = required.filter(([token]) => !view.includes(token)).map(([, label]) => label)
if (missing.length) { console.error(missing.map(label => `- missing ${label}`).join('\n')); process.exit(1) }
console.log('P2-C image navigation contract passed: cursor-anchored wheel zoom, pointer-captured pan, double-click toggle and keyboard fallback are connected.')
