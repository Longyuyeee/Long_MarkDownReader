import fs from 'node:fs'

const contract = JSON.parse(fs.readFileSync('shared/pdf-advanced-editing-contract.json', 'utf8'))
const backend = fs.readFileSync('src-tauri/src/commands/pdf.rs', 'utf8')
const registry = JSON.parse(fs.readFileSync('shared/file-formats.json', 'utf8'))
const audit = fs.readFileSync('docs/P1B1_PDF_Safety_Boundary_Audit_2026-08-15.md', 'utf8')
const fail = message => { console.error(message); process.exit(1) }

if (!['P1-B1', 'P1-B2B1', 'P1-B2B2', 'P1-B2B3', 'P1-B2B4'].includes(contract.stage) || !['audit-complete', 'text-form-copy-backend-complete', 'text-form-copy-workspace-complete', 'unicode-text-form-copy-complete', 'checkbox-form-copy-complete'].includes(contract.status) || contract.plannedSlices?.length !== 5) fail('P1-B1 contract lineage is incomplete')
for (const token of ['encrypted_pdf_unverified', 'digital_signature_unverified', 'acroform_unverified', 'save_pdf_page_plan_copy', 'save_pdf_page_range_copy', 'save_pdf_merge_copy', 'save_pdf_insert_copy', 'write_pdf_annotations', 'write_pdf_ocr']) {
  if (!backend.includes(token)) fail(`P1-B1 backend fact is missing: ${token}`)
}
const pdf = registry.formats.find(item => item.id === 'pdf')
if (!pdf || pdf.capabilities?.edit !== 'supported' || pdf.userCapability?.saveMode !== 'copy' || pdf.adapters?.writer !== 'pdf-copy' || contract.registryFinding?.status !== 'reconciled-before-b2b') fail('P1-B1 registry reconciliation is incomplete')
for (const section of ['## 1. 结论', '## 2. 当前真实能力', '## 3. 审计发现', '## 4. 高风险边界', '## 5. 顺序开发计划', '## 6. P1-B2A 入口']) {
  if (!audit.includes(section)) fail(`P1-B1 audit section is missing: ${section}`)
}

console.log('P1-B1 PDF safety audit passed: copy/sidecar capabilities are reconciled while mandatory blockers and the B2A-B5 sequence remain frozen.')
