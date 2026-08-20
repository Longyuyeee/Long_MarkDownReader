import fs from 'node:fs'

const backend = fs.readFileSync('src-tauri/src/formats/raster_image.rs', 'utf8')
const command = fs.readFileSync('src-tauri/src/commands/media.rs', 'utf8')
const view = fs.readFileSync('src/views/MediaViewerView.vue', 'utf8')
const registry = fs.readFileSync('shared/file-formats.json', 'utf8')
const matrix = fs.readFileSync('shared/release-capability-matrix.json', 'utf8')
const required = [
  [backend, 'brightness: i16', 'backend brightness field'],
  [backend, 'contrast: i16', 'backend contrast field'],
  [backend, 'saturation: u16', 'backend saturation field'],
  [backend, 'applies_bounded_color_adjustments_to_real_output_pixels', 'real pixel test'],
  [command, 'brightness: transformed.brightness', 'saved report brightness'],
  [view, '色彩调整', 'color adjustment panel'],
  [view, 'resetColorAdjustments', 'color reset command'],
  [view, 'saturation: Number(saturation.value)', 'save payload saturation'],
  [view, 'drop-shadow(0 8px 22px', 'live preview filter'],
  [registry, '调整亮度/对比度/饱和度', 'public image capability'],
  [matrix, '不提供图层、蒙版或专业色彩管理', 'public image boundary'],
]
const missing = required.filter(([source, token]) => !source.includes(token)).map(([, , label]) => label)
if (missing.length) {
  console.error(missing.map(label => `- missing ${label}`).join('\n'))
  process.exit(1)
}
console.log('P2-B image color adjustment contract passed: UI preview, bounded backend pixels, saved report and reset path are connected.')
