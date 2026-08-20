import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve('docs/evidence/p2b-image-color-adjustments')
const runtime = JSON.parse(fs.readFileSync(path.join(root, 'runtime-evidence.json'), 'utf8'))
const independent = JSON.parse(fs.readFileSync(path.join(root, 'independent-verification.json'), 'utf8').replace(/^\uFEFF/, ''))
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'))
const failures = []
if (!runtime.passed || runtime.runtimeErrorCount !== 0) failures.push('desktop runtime did not pass cleanly')
if (runtime.saveReport?.brightness !== 20 || runtime.saveReport?.contrast !== 15 || runtime.saveReport?.saturation !== 0) failures.push('saved adjustment report drift')
if (!runtime.saveReport?.sourceUnchanged || !runtime.saveReport?.targetReopened) failures.push('reliable copy boundary failed')
if (runtime.wide?.overflow > 2 || runtime.narrow?.overflow > 2 || runtime.narrow?.panel?.width < 500) failures.push('responsive desktop layout failed')
if (independent.status !== 'passed' || !independent.actual?.sourceUnchanged || !independent.actual?.outputReopens || !independent.actual?.sampleIsGrayscale) failures.push('independent pixel verification failed')
if (independent.sourceSha256 === independent.targetSha256) failures.push('color-adjusted output must differ from source')
if (manifest.status !== 'accepted' || manifest.screenshots?.length !== 2 || manifest.sourceUserContentIncluded !== false) failures.push('evidence manifest is incomplete')
if (failures.length) { console.error(failures.map(item => `- ${item}`).join('\n')); process.exit(1) }
console.log('P2-B real evidence passed: desktop wide/narrow UI, source preservation, target reopen and independent grayscale pixels match expectations.')
