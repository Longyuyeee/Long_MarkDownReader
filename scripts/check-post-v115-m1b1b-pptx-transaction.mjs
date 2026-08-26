import fs from 'node:fs'
const policy = JSON.parse(fs.readFileSync('shared/post-v115-m1b1b-pptx-transaction-policy.json', 'utf8'))
const command = fs.readFileSync('src-tauri/src/commands/pptx.rs', 'utf8')
const registration = fs.readFileSync('src-tauri/src/lib.rs', 'utf8')
const view = fs.readFileSync('src/views/PptxReaderView.vue', 'utf8')
const failures = []
for (const marker of ['build_pptx_transaction', 'deterministic_replay_verified', 'preview_pptx_patch_transaction', 'save_pptx_patch_source_transaction', 'm1b1b_saves_deterministic_text_and_slide_transactions_for_real_producers']) {
  if (!command.includes(marker)) failures.push(`Missing M1B1B marker: ${marker}`)
}
for (const marker of ['preview_pptx_patch_transaction', 'save_pptx_patch_source_transaction']) {
  if (!registration.includes(marker)) failures.push(`Missing registered transaction command: ${marker}`)
}
if (!command.includes('operations.len() > 64') || !command.includes('PPTX 事务包含重复目标')) failures.push('Transaction bounds or conflict gate is missing')
if (view.includes('save_pptx_patch_source_transaction')) failures.push('Frontend transaction must remain disabled until M1B1C')
if (policy.afterActual.frontendUnifiedDrafts !== false || policy.afterActual.publicCapabilityUpdated !== false) failures.push('Policy overstates M1B1B capability')
if (failures.length) { console.error(failures.join('\n')); process.exit(1) }
console.log('M1B1B contract accepted: deterministic bounded PPTX transactions are registered; frontend remains unchanged.')
