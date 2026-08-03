import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const policy = JSON.parse(fs.readFileSync(path.join(root, 'shared', 'v1-community-release-policy.json'), 'utf8'))
const version = pkg.version
const output = path.join(root, '.release-secrets', `release-v${version}`)
const sourceMsi = path.join(root, 'src-tauri', 'target', 'release', 'bundle', 'msi', `Long编辑_${version}_x64_zh-CN.msi`)
const sourceExe = path.join(root, 'src-tauri', 'target', 'release', 'bundle', 'nsis', `Long编辑_${version}_x64-setup.exe`)
const signedUpdater = policy.patchValidation?.automaticUpdaterAssetsPlanned === true

fs.mkdirSync(output, { recursive: true })
for (const entry of fs.readdirSync(output)) fs.rmSync(path.join(output, entry), { recursive: true, force: true })

const assets = [
  { source: sourceExe, name: `LongEdit_${version}_x64-setup.exe` },
  { source: sourceMsi, name: `LongEdit_${version}_x64_zh-CN.msi` },
]

for (const asset of assets) {
  if (!fs.existsSync(asset.source)) throw new Error(`release bundle is missing: ${asset.source}`)
  if (signedUpdater && !fs.existsSync(`${asset.source}.sig`)) throw new Error(`updater signature is missing: ${asset.source}.sig`)
  fs.copyFileSync(asset.source, path.join(output, asset.name))
  if (signedUpdater) fs.copyFileSync(`${asset.source}.sig`, path.join(output, `${asset.name}.sig`))
}

const shaLines = assets.map(({ name }) => {
  const content = fs.readFileSync(path.join(output, name))
  return `${crypto.createHash('sha256').update(content).digest('hex')}  ${name}`
})
fs.writeFileSync(path.join(output, 'SHA256SUMS.txt'), `${shaLines.join('\n')}\n`, 'utf8')

if (signedUpdater) {
  const signature = fs.readFileSync(path.join(output, `${assets[0].name}.sig`), 'utf8').trim()
  const manifest = {
    version,
    notes: `LongEdit v${version}`,
    pub_date: new Date().toISOString(),
    platforms: {
      'windows-x86_64': {
        signature,
        url: `https://github.com/Longyuyeee/Long_MarkDownReader/releases/download/v${version}/${assets[0].name}`,
      },
    },
  }
  fs.writeFileSync(path.join(output, 'latest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
}

console.log(`Prepared ${assets.length + 1 + (signedUpdater ? 3 : 0)} release assets in ${output}`)
console.log(shaLines.join('\n'))
if (!signedUpdater) console.log('Automatic updater assets intentionally omitted: the original updater private key is unavailable.')
