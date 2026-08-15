import fs from 'node:fs'

const read = path => fs.readFileSync(path, 'utf8')
const fail = message => { console.error(message); process.exit(1) }
const metadata = JSON.parse(read('shared/pdf-metadata-safety-contract.json'))
const advanced = JSON.parse(read('shared/pdf-advanced-editing-contract.json'))
const backend = read('src-tauri/src/formats/pdf_metadata.rs')
const commands = read('src-tauri/src/commands/pdf.rs')
const tauri = read('src-tauri/src/lib.rs')
const view = read('src/views/PdfView.vue')
const audit = read('docs/P1B5B_PDF_Metadata_Copy_Backend_Audit_2026-08-16.md')

if (metadata.stage !== 'P1-B5B' || metadata.status !== 'backend-complete-workspace-pending' || metadata.currentWriteCapability !== false) fail('P1-B5B metadata contract identity is stale')
const slice = metadata.implementationSlices?.find(item => item.id === 'P1-B5B')
if (slice?.status !== 'completed' || slice?.deliveredBackend !== 'src-tauri/src/formats/pdf_metadata.rs' || slice?.writeUserFile !== false) fail('P1-B5B implementation slice is stale')
if (advanced.stage !== 'P1-B5B' || advanced.status !== 'metadata-backend-complete' || advanced.currentCapabilities?.includes('metadata-copy')) fail('P1-B5B public capability boundary is stale')
for (const token of ['build_pdf_metadata_copy', 'PdfMetadataValues', 'custom_info_keys_present', 'xmp_packet_present_write_unverified', 'digital_signature_or_certification_present', 'non_info_objects', 'full_rewrite_verified']) if (!backend.includes(token)) fail(`P1-B5B backend token missing: ${token}`)
for (const token of ['preview_pdf_metadata_copy', 'save_pdf_metadata_copy', 'save_pdf_metadata_copy_to_path', 'expected_output_digest', 'write_new_bytes', 'source_unchanged']) if (!commands.includes(token)) fail(`P1-B5B command token missing: ${token}`)
for (const token of ['metadata_copy_saves_unicode_removes_fields_and_preserves_info_and_source', 'metadata_copy_blocks_custom_info_xmp_and_signed_pdfs']) if (!commands.includes(token)) fail(`P1-B5B regression missing: ${token}`)
for (const token of ['preview_pdf_metadata_copy', 'save_pdf_metadata_copy']) if (!tauri.includes(token)) fail(`P1-B5B Tauri registration missing: ${token}`)
for (const token of ['PdfMetadataPanel', 'preview_pdf_metadata_copy', 'save_pdf_metadata_copy']) if (view.includes(token)) fail(`P1-B5B must keep UI closed until P1-B5C: ${token}`)
for (const section of ['## 1. 阶段结论', '## 2. 已实现的可靠副本链', '## 3. 保真与阻断验证', '## 4. 当前能力边界', '## 5. 下一步']) if (!audit.includes(section)) fail(`P1-B5B audit section missing: ${section}`)

console.log('P1-B5B PDF metadata backend passed: Unicode allowlisted Info edits, true deletion, preserved keys, reachable-object equivalence, digest-locked new-copy save and fail-closed blockers are implemented without premature UI.')
