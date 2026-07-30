import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const inputPath = process.argv[2] || process.env.LONGEDIT_R5C_ROUTE_PERFORMANCE_INPUT
const outputDirectory = path.resolve(process.env.LONGEDIT_R5C_EVIDENCE_OUTPUT || 'docs/evidence/r5c-route-performance-smoke')

const fail = message => {
  console.error(`R5C route performance capture failed: ${message}`)
  process.exit(1)
}

if (!inputPath) {
  fail('missing input JSON. Export window.__LONGEDIT_EXPORT_ROUTE_PERFORMANCE__() from the desktop app and pass the saved JSON path as the first argument.')
}

const resolvedInput = path.resolve(inputPath)
if (!fs.existsSync(resolvedInput)) fail(`input JSON does not exist: ${resolvedInput}`)

const evidence = JSON.parse(fs.readFileSync(resolvedInput, 'utf8').replace(/^\uFEFF/, ''))
if (evidence.schemaVersion !== 1) fail('input schemaVersion must be 1')
if (typeof evidence.capturedAt !== 'string') fail('capturedAt must be present')
if (!Number.isInteger(evidence.routeHistoryLimit) || evidence.routeHistoryLimit <= 0) fail('routeHistoryLimit must be a positive integer')
if (!Array.isArray(evidence.routes)) fail('routes must be an array')
if (!Array.isArray(evidence.measures)) fail('measures must be an array')

for (const [index, route] of evidence.routes.entries()) {
  if (typeof route.routeName !== 'string' || !route.routeName) fail(`routes[${index}].routeName is invalid`)
  if (!Number.isFinite(route.elapsedMs) || route.elapsedMs < 0) fail(`routes[${index}].elapsedMs is invalid`)
  if (typeof route.recordedAt !== 'string') fail(`routes[${index}].recordedAt is invalid`)
}

for (const [index, measure] of evidence.measures.entries()) {
  if (typeof measure.name !== 'string' || !measure.name.startsWith('longedit:route:')) fail(`measures[${index}].name is invalid`)
  if (!Number.isFinite(measure.durationMs) || measure.durationMs < 0) fail(`measures[${index}].durationMs is invalid`)
  if (!Number.isFinite(measure.startTimeMs) || measure.startTimeMs < 0) fail(`measures[${index}].startTimeMs is invalid`)
}

const relativeInput = path.relative(root, resolvedInput).replace(/\\/g, '/')
const normalizedEvidence = {
  ...evidence,
  normalizedAt: new Date().toISOString(),
  sourceInput: relativeInput.startsWith('..') ? resolvedInput : relativeInput,
  sourceUserContentIncluded: false,
}

const manifest = {
  schemaVersion: 1,
  stage: 'R5C',
  capturedAt: normalizedEvidence.capturedAt,
  normalizedAt: normalizedEvidence.normalizedAt,
  sourceInput: normalizedEvidence.sourceInput,
  outputDirectory: path.relative(root, outputDirectory).replace(/\\/g, '/'),
  routeCount: evidence.routes.length,
  measureCount: evidence.measures.length,
  sourceUserContentIncluded: false,
  releaseCandidate: false,
  promotionEligible: false,
}

fs.mkdirSync(outputDirectory, { recursive: true })
fs.writeFileSync(path.join(outputDirectory, 'route-performance-evidence.json'), `${JSON.stringify(normalizedEvidence, null, 2)}\n`)
fs.writeFileSync(path.join(outputDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

console.log(`R5C route performance evidence captured: ${manifest.routeCount} routes, ${manifest.measureCount} measures -> ${manifest.outputDirectory}`)
