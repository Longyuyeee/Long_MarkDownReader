import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const root = process.cwd()
const policy = JSON.parse(fs.readFileSync('shared/r5d-production-route-smoke-preflight-policy.json', 'utf8'))
const distDirectory = path.resolve(policy.preflightInputs.distDirectory)
const assetDirectory = path.resolve(policy.preflightInputs.assetDirectory)
const outputDirectory = path.resolve(process.env.LONGEDIT_R5D_EVIDENCE_OUTPUT || 'docs/evidence/r5d-production-route-smoke-preflight')

const fail = message => {
  console.error(`R5D production route smoke preflight failed: ${message}`)
  process.exit(1)
}

const relative = filePath => path.relative(root, filePath).replace(/\\/g, '/')
const sha256 = filePath => crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')

if (!fs.existsSync(distDirectory)) fail('dist directory does not exist. Run npm run build first.')
if (!fs.existsSync(assetDirectory)) fail('dist/assets directory does not exist. Run npm run build first.')

const jsAssets = fs.readdirSync(assetDirectory)
  .filter(name => name.endsWith('.js'))
  .sort()
  .map(name => {
    const filePath = path.join(assetDirectory, name)
    const stat = fs.statSync(filePath)
    return {
      file: relative(filePath),
      bytes: stat.size,
      sha256: sha256(filePath),
    }
  })

const mainAssets = jsAssets.filter(asset => asset.file.includes('/index-'))
if (!mainAssets.length) fail('main index asset was not found')

const mainBundleText = mainAssets.map(asset => fs.readFileSync(path.resolve(asset.file), 'utf8')).join('\n')
if (!mainBundleText.includes(policy.preflightInputs.requiresRuntimeExportToken)) {
  fail(`runtime export token missing from production bundle: ${policy.preflightInputs.requiresRuntimeExportToken}`)
}

const routeAssets = policy.requiredRouteAssetFamilies.map(family => {
  const matches = jsAssets.filter(asset => path.basename(asset.file).startsWith(`${family}-`))
  return {
    family,
    status: matches.length ? 'present' : 'missing',
    assets: matches,
  }
})

const missing = routeAssets.filter(route => route.status !== 'present')
if (missing.length) fail(`missing route asset families: ${missing.map(route => route.family).join(', ')}`)

const manifest = {
  schemaVersion: 1,
  stage: 'R5D',
  appVersion: policy.appVersion,
  capturedAt: new Date().toISOString(),
  currentStatus: policy.currentStatus,
  distDirectory: relative(distDirectory),
  assetDirectory: relative(assetDirectory),
  runtimeExportTokenFound: true,
  routeAssetFamiliesPresent: routeAssets.length,
  routeAssetFamiliesRequired: policy.requiredRouteAssetFamilies.length,
  jsAssetCount: jsAssets.length,
  largestJsAsset: [...jsAssets].sort((a, b) => b.bytes - a.bytes)[0],
  sourceUserContentIncluded: false,
  releaseCandidate: false,
  promotionEligible: false,
  evidenceLevel: 'production-dist-preflight',
}

fs.mkdirSync(outputDirectory, { recursive: true })
fs.writeFileSync(path.join(outputDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
fs.writeFileSync(path.join(outputDirectory, 'route-assets.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'R5D', routeAssets }, null, 2)}\n`)

console.log(`R5D production route smoke preflight captured: ${routeAssets.length}/${policy.requiredRouteAssetFamilies.length} route asset families, ${jsAssets.length} JS assets.`)
