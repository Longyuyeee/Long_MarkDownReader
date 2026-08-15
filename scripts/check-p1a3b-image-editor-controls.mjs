import fs from 'node:fs'

const source = fs.readFileSync('src/views/MediaViewerView.vue', 'utf8')
const fail = message => { console.error(message); process.exit(1) }
const required = [
  '精确裁剪',
  'cropEnabled',
  'validCrop',
  'cropBounds',
  'jpegQuality',
  'JPEG 质量',
  'normalizeOrientation: true',
  'metadataRemoved',
  '移除 EXIF、GPS、注释等隐私元数据',
  "crop: cropEnabled.value ?",
  "jpegQuality: outputExtension.value === 'jpg'",
]

for (const token of required) {
  if (!source.includes(token)) fail(`P1-A3B image editor control is missing: ${token}`)
}
if (!source.includes("v-if=\"editableSource\"") || !source.includes("&& !isExternal.value")) {
  fail('P1-A3B must remain library-only')
}
if (!source.includes("saving || !validOutputDimensions || !validCrop || !validJpegQuality")) {
  fail('P1-A3B save gate does not reject invalid crop or JPEG quality')
}

console.log('P1-A3B image editor controls passed: precise crop, JPEG quality and mandatory privacy cleanup stay inside the library-only right workspace.')
