import fs from 'node:fs'

const policy = JSON.parse(fs.readFileSync('shared/post-v115-m1b1a-pptx-source-save-policy.json', 'utf8'))
const command = fs.readFileSync('src-tauri/src/commands/pptx.rs', 'utf8')
const registration = fs.readFileSync('src-tauri/src/lib.rs', 'utf8')
const view = fs.readFileSync('src/views/PptxReaderView.vue', 'utf8')
const failures = []

for (const marker of [
  'save_pptx_patch_source_to_path',
  'recover_interrupted_write(source_path)',
  'write_bytes(source_path, &built.output)',
  'write_bytes(source_path, &source)',
  'source_saved_verified',
  'm1b1a_reliably_overwrites_and_reopens_all_three_producer_sources',
]) {
  if (!command.includes(marker)) failures.push(`PPTX source-save marker is missing: ${marker}`)
}
if (!command.includes('save_pptx_patch_copy_to_path')) failures.push('Existing PPTX reliable-copy core is missing')
for (const marker of ['save_pptx_patch_copy', 'save_pptx_patch_source']) {
  if (!command.includes(`pub async fn ${marker}`) || !registration.includes(marker)) failures.push(`Registered PPTX command is missing: ${marker}`)
}
if (!view.includes('源 PPTX 始终只读') || !view.includes('可靠另存副本')) {
  failures.push('M1B1A must retain the current frontend boundary until the unified draft stage')
}
if (view.includes('save_pptx_patch_source')) failures.push('M1B1A must not expose source overwrite before frontend confirmation and history are implemented')
if (policy.afterActual.frontendSourceSave !== false || policy.afterActual.publicCapabilityUpdated !== false) {
  failures.push('M1B1A policy must keep frontend and public capability disabled')
}

if (failures.length) {
  console.error(failures.join('\n'))
  process.exit(1)
}
console.log('M1B1A contract accepted: protected PPTX source save is registered; copy and current UI boundaries are retained.')
