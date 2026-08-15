import fs from 'node:fs'

const read = path => fs.readFileSync(path, 'utf8')
const fail = message => { console.error(message); process.exit(1) }
const metadata = JSON.parse(read('shared/pdf-metadata-safety-contract.json'))
const advanced = JSON.parse(read('shared/pdf-advanced-editing-contract.json'))
const audit = read('docs/P1B5A_PDF_Metadata_Copy_Safety_Audit_2026-08-16.md')
const commands = read('src-tauri/src/commands/pdf.rs')
const tauri = read('src-tauri/src/lib.rs')
const view = read('src/views/PdfView.vue')

if (!['P1-B5A', 'P1-B5B', 'P1-B5C'].includes(metadata.stage) || !['safety-audit-complete-backend-pending', 'backend-complete-workspace-pending', 'workspace-complete-desktop-evidence-pending'].includes(metadata.status) || metadata.currentWriteCapability !== ['P1-B5C'].includes(metadata.stage) || metadata.securityMeaning !== 'descriptive-document-properties-only-not-complete-privacy-scrubbing' || metadata.approvedArchitecture !== 'full-rewrite-source-clone-plus-canonical-info-dictionary') fail('P1-B5A metadata contract identity is stale')
if (metadata.editableFields?.map(item => item.id).join(',') !== 'title,author,subject,keywords' || metadata.editableFields?.some(item => item.emptyMeaning !== 'remove-key')) fail('P1-B5A editable field allowlist is stale')
for (const item of ['encrypted_pdf_unverified', 'digital_signature_or_certification_present', 'pdfa_conformance_unverified', 'custom_info_keys_present', 'xmp_packet_present_write_unverified', 'embedded_file_metadata_cleanup_unverified', 'source_digest_changed', 'existing_target_path']) if (!metadata.hardBlockers?.includes(item)) fail(`P1-B5A blocker missing: ${item}`)
for (const item of ['source-file-and-existing-targets-are-never-overwritten', 'only-Title-Author-Subject-and-Keywords-may-change-or-be-removed', 'Creator-Producer-CreationDate-ModDate-and-Trapped-remain-byte-equivalent', 'unknown-info-keys-and-existing-XMP-cause-a-blocker-instead-of-partial-editing']) if (!metadata.preservationInvariants?.includes(item)) fail(`P1-B5A preservation invariant missing: ${item}`)
for (const item of ['saved-target-reopens-and-canonical-info-values-match-request', 'cleared-allowlisted-fields-are-absent-not-empty-stale-values', 'independent-pypdf-read-confirms-requested-values-and-source-preservation', 'independent-poppler-render-confirms-pages-remain-visually-equivalent']) if (!metadata.verificationGates?.includes(item)) fail(`P1-B5A verification gate missing: ${item}`)
for (const item of ['editing-only-Info-while-leaving-conflicting-XMP', 'deleting-all-metadata-without-an-explicit-separate-privacy-contract', 'incremental-update-that-keeps-old-metadata-revisions', 'marketing-four-field-editing-as-complete-anonymization']) if (!metadata.rejectedApproaches?.includes(item)) fail(`P1-B5A rejected approach missing: ${item}`)
if (!['P1-B5A', 'P1-B5B', 'P1-B5C'].includes(advanced.stage) || !['metadata-safety-audit-complete', 'metadata-backend-complete', 'metadata-workspace-complete'].includes(advanced.status) || advanced.currentCapabilities?.includes('metadata-copy') !== ['P1-B5C'].includes(advanced.stage) || !['safety-audit-complete-backend-pending', 'backend-complete-workspace-pending', 'workspace-complete-desktop-evidence-pending'].includes(advanced.plannedSlices?.find(item => item.id === 'P1-B5')?.status) || advanced.plannedSlices?.find(item => item.id === 'P1-B5')?.currentWriteUserFile !== ['P1-B5C'].includes(advanced.stage)) fail('P1-B5A advanced capability boundary is stale')
if (metadata.stage === 'P1-B5A') for (const token of ['preview_pdf_metadata_copy', 'save_pdf_metadata_copy']) if (commands.includes(token) || tauri.includes(token) || view.includes(token)) fail(`P1-B5A must not expose a premature writer: ${token}`)
for (const section of ['## 1. 需求对齐与审计结论', '## 2. 元数据位置与威胁模型', '## 3. 冻结的安全子集', '## 4. 验证计划', '## 5. 实施顺序与能力边界']) if (!audit.includes(section)) fail(`P1-B5A audit section missing: ${section}`)

console.log('P1-B5A PDF metadata safety audit passed: four descriptive fields, Info/XMP consistency blockers, full-rewrite copy semantics and explicit non-anonymization boundaries are frozen without a premature writer.')
