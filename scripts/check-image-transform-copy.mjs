import fs from 'node:fs'

const read = file => fs.readFileSync(file, 'utf8')
const fail = message => { console.error(message); process.exit(1) }
const requireTokens = (source, label, tokens) => {
  for (const token of tokens) if (!source.includes(token)) fail(`${label} token missing: ${token}`)
}

const cargo = read('src-tauri/Cargo.toml')
const engine = read('src-tauri/src/formats/raster_image.rs')
const commands = read('src-tauri/src/commands/media.rs')
const tauriLib = read('src-tauri/src/lib.rs')

requireTokens(cargo, 'Image dependency', [
  'image = { version = "=0.25.10"',
  'default-features = false',
  'features = ["png", "jpeg", "webp", "bmp"]',
])
requireTokens(engine, 'Bounded raster engine', [
  'EDITABLE_IMAGE_EXTENSIONS',
  'MAX_IMAGE_BYTES',
  'MAX_IMAGE_EDGE',
  'MAX_IMAGE_PIXELS',
  'reader.limits(limits)',
  'rotate90()',
  'fliph()',
  'flipv()',
  'resize_exact',
  '结构复读尺寸',
  'rejects_preview_only_and_unknown_output_formats',
])
requireTokens(commands, 'Reliable image copy commands', [
  'pub async fn inspect_image_edit_source',
  'pub async fn save_image_transform_copy',
  'resolve_existing_file(source_path, EDITABLE_IMAGE_EXTENSIONS)',
  'resolve_file_for_write(target_path, EDITABLE_IMAGE_EXTENSIONS)',
  '源图片已被外部修改',
  'write_new_bytes(target_path, &transformed.output_bytes)',
  'remove_created_image_if_exact',
  'source_unchanged: true',
  'target_reopened: true',
  'saves_verified_copy_without_changing_or_overwriting_source',
])
requireTokens(tauriLib, 'Tauri command registration', [
  'inspect_image_edit_source',
  'save_image_transform_copy',
])
if (commands.includes('inspect_external_image_edit_source') || commands.includes('save_external_image_transform_copy')) {
  fail('External image write authorization must not be introduced in P1-A1')
}

console.log('P1-A1 image transform copy contract passed: bounded PNG/JPEG/WebP/BMP processing, source identity checks, atomic no-overwrite save, and output reopen verification are present.')
