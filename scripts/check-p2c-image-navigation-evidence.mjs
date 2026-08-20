import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve('docs/evidence/p2c-image-navigation')
const runtime = JSON.parse(fs.readFileSync(path.join(root, 'runtime-evidence.json'), 'utf8'))
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'))
const actual = runtime.actual || {}
const failures = []
if (!runtime.passed || runtime.runtimeErrorCount !== 0) failures.push('real desktop runtime did not pass cleanly')
if (!(actual.initial?.scale < 1 && actual.zoomed?.scale >= 1.2)) failures.push('real wheel zoom did not change scale')
if (actual.anchorDrift?.x > 0.06 || actual.anchorDrift?.y > 0.06) failures.push('cursor anchor drift exceeds tolerance')
if (!(actual.panned?.stage?.scrollLeft > actual.zoomed?.stage?.scrollLeft + 100 && actual.panned?.stage?.scrollTop > actual.zoomed?.stage?.scrollTop + 60)) failures.push('real pointer drag did not pan both axes')
if (actual.actualSize?.scale !== 1 || !(actual.fittedAgain?.scale < 1)) failures.push('double-click actual/fit toggle failed')
if (actual.initial?.overflow > 2 || actual.narrowZoomed?.overflow > 2) failures.push('page-level overflow detected')
if (manifest.status !== 'accepted' || manifest.screenshots?.length !== 2 || manifest.sourceUserContentIncluded !== false) failures.push('evidence manifest is incomplete')
if (failures.length) { console.error(failures.map(item => `- ${item}`).join('\n')); process.exit(1) }
console.log('P2-C real evidence passed: cursor anchor, wheel scale, two-axis drag pan, double-click toggle and responsive layout match expectations.')
