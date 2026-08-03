import crypto from 'node:crypto'
import fs from 'node:fs'

const failures = []
const fail = message => failures.push(message)
const read = path => fs.readFileSync(path)
const hash = path => crypto.createHash('sha256').update(read(path)).digest('hex')

const pngInfo = path => {
  const data = read(path)
  if (data.length < 24 || data.subarray(1, 4).toString('ascii') !== 'PNG') fail(`${path} is not a PNG`)
  return {
    size: [data.readUInt32BE(16), data.readUInt32BE(20)],
    colorType: data[25],
  }
}

const required = [
  'design/brand/longedit-icon-v1.0.1.png',
  'design/brand/longedit-icon-v1.0.2.png',
  'icon.png',
  'public/icon.png',
  'src-tauri/icons/icon.png',
  'src-tauri/icons/icon.ico',
  'src-tauri/icons/icon.icns',
  'src-tauri/icons/32x32.png',
  'src-tauri/icons/128x128@2x.png',
]

for (const path of required) if (!fs.existsSync(path) || fs.statSync(path).size === 0) fail(`missing brand asset: ${path}`)

if (failures.length === 0) {
  const currentHash = hash('design/brand/longedit-icon-v1.0.2.png')
  if (currentHash === hash('design/brand/longedit-icon-v1.0.1.png')) fail('solid-gold master must differ from the v1.0.1 outline master')
  if (new Set(['icon.png', 'public/icon.png', 'src-tauri/icons/icon.png'].map(hash)).size !== 1) fail('root, public, and Tauri icon PNGs are not synchronized')
  const master = pngInfo('design/brand/longedit-icon-v1.0.2.png')
  if (master.size.join('x') !== '1254x1254') fail('brand master dimensions drift')
  if (![4, 6].includes(master.colorType)) fail('brand master must retain an alpha channel')
  if (pngInfo('src-tauri/icons/icon.png').size.join('x') !== '512x512') fail('Tauri primary icon dimensions drift')
  if (pngInfo('src-tauri/icons/32x32.png').size.join('x') !== '32x32') fail('small icon dimensions drift')
}

const readme = fs.readFileSync('design/brand/README.md', 'utf8')
const audit = fs.readFileSync('docs/Brand_Icon_Solid_Gold_Audit_2026-08-03.md', 'utf8')
const pkg = fs.readFileSync('package.json', 'utf8')
for (const token of ['longedit-icon-v1.0.1.png', 'longedit-icon-v1.0.2.png', '实心金色']) if (!readme.includes(token)) fail(`brand README is missing ${token}`)
for (const token of ['实心金色', '透明圆角', '32px', 'check:brand-icon-contract']) if (!audit.includes(token)) fail(`brand audit is missing ${token}`)
if (!pkg.includes('npm run check:brand-icon-contract')) fail('brand icon contract is not reachable from the patch release gate')

if (failures.length) {
  console.error(failures.map(message => `- ${message}`).join('\n'))
  process.exit(1)
}

console.log('Brand icon contract passed: solid-gold master, synchronized app assets, and platform icons are present.')
