import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { textEvidenceMatchesSha256 } from './lib/text-evidence-integrity.mjs'

const read = file => fs.readFileSync(file)
const text = file => read(file).toString('utf8')
const json = file => JSON.parse(text(file))
const sha256 = file => crypto.createHash('sha256').update(read(file)).digest('hex')
const fail = message => { throw new Error(`UX-36 file-tree actions rejected: ${message}`) }
const root = 'docs/evidence/ux36-file-tree-actions'
const packageJson = json('package.json')
const registry = json('shared/file-formats.json')
const manifest = json(path.join(root, 'manifest.json'))
const evidence = json(path.join(root, manifest.evidenceFile))
const library = text('src/views/LibraryMode.vue')
const files = text('src-tauri/src/commands/files.rs')
const capture = text('scripts/capture-ux36-file-tree-actions.mjs')
const runner = text('scripts/run-ux36-file-tree-actions-audit.ps1')

if (manifest.schemaVersion !== 1 || manifest.stage !== 'UX-36' || manifest.status !== 'accepted') fail('manifest identity drift')
if (manifest.productSourceCommit !== '24455dd556367aeedbb308708c42321a4910e684' || evidence.sourceCommit !== manifest.productSourceCommit) fail('product source commit drift')
if (manifest.visualReview !== 'accepted' || manifest.sourceUserContentIncluded !== false || manifest.releaseCandidate !== false) fail('visual, privacy, or release boundary drift')
if (!textEvidenceMatchesSha256(path.join(root, manifest.evidenceFile), manifest.evidenceSha256)) fail('evidence hash drift')
if (!Array.isArray(manifest.screenshots) || manifest.screenshots.length !== 3) fail('screenshot manifest drift')
for (const screenshot of manifest.screenshots) {
  const file = path.join(root, screenshot.file)
  if (fs.statSync(file).size !== screenshot.bytes || screenshot.bytes < 60000 || sha256(file) !== screenshot.sha256) fail(`screenshot integrity drift: ${screenshot.file}`)
}

const creatable = registry.formats.filter(format => format.capabilities.create === 'supported')
if (creatable.length !== 28) fail(`current creatable registry count drift: ${creatable.length}`)
for (const token of [
  'data-testid="library-tree-viewport"',
  '@contextmenu="openRootContextMenu"',
  "{ label: '文档', ids: ['markdown', 'plain-text']",
  "{ label: '数据', ids: ['json', 'jsonc', 'yaml', 'xml', 'toml', 'table']",
  "{ label: '图表与画布', ids: ['canvas', 'drawio', 'diagram', 'opml', 'svg']",
  "{ label: '代码与配置', ids: ['javascript', 'typescript', 'python', 'rust', 'go', 'jvm-code', 'c-family', 'shell', 'sql', 'web-source', 'env', 'ini', 'properties', 'editorconfig', 'gitignore']",
  "label: '新建'",
  "key: `create-format:${format.id}`",
  "完整名称{{ renameState.isDir ? '' : '（包含后缀）' }}",
  `:title="renameState.confirmExtension ? '确认更改文件格式' : '项目重命名'"`,
  '文件内容不会自动转换',
  'syncRenamedWorkspaceReferences(oldPath, newPath)',
]) if (!library.includes(token)) fail(`frontend contract missing: ${token}`)
if (library.includes("placeholder=\"请输入新名称（无需后缀）\"") || library.includes("name = name.replace(/(?:\\.table\\.json")) fail('legacy extension-stripping rename flow returned')
for (const token of ['fn validate_item_name', '名称使用了 Windows 保留名称', '目标目录已存在同名项目，请使用其他名称', 'if new_path.exists()', '重命名失败: {error}']) if (!files.includes(token)) fail(`Rust rename safety missing: ${token}`)

if (evidence.schemaVersion !== 1 || evidence.stage !== 'UX-36' || evidence.rootFirstOption !== '新建' || evidence.directoryFirstOption !== '新建') fail('context menu evidence drift')
if (evidence.categories?.join(',') !== '文档,数据,图表与画布,代码与配置' || evidence.creatableFormatCount !== 18 || evidence.jsonCreated !== true) fail('creation evidence drift')
if (evidence.fullFilenameShown !== true || evidence.conflictRejected !== true || evidence.renameOfferedInContextMenu !== true) fail('rename entry or conflict evidence drift')
if (!evidence.confirmation?.visible || !evidence.confirmation?.explainsNoConversion || !evidence.confirmation?.oldFormat || !evidence.confirmation?.newFormat) fail('format confirmation evidence drift')
if (!evidence.renameResult?.renamedVisible || !evidence.renameResult?.originalAbsent || !evidence.renameResult?.tabSynchronized || !evidence.renameResult?.routeSynchronized) fail('rename synchronization evidence drift')
if (evidence.runtimeErrorCount !== 0 || evidence.blockingErrorSurfaceObserved !== false || evidence.sourceUserContentIncluded !== false || evidence.releaseCandidate !== false) fail('runtime, privacy, or release evidence drift')
if (/([A-Za-z]:\\\\Users\\\\|\\\\\\\\\?\\\\[A-Za-z]:)/.test(JSON.stringify(evidence))) fail('evidence contains an unredacted local path')

for (const token of ['renameOfferedInContextMenu', 'conflictRejected', 'submitRenameWithEnter', 'rename-format-confirmation.jpg', 'sourceUserContentIncluded: false']) if (!capture.includes(token)) fail(`desktop capture token missing: ${token}`)
for (const token of ['LONGEDIT_E2E_LIBRARY', 'UX36 Rename Source.md', 'UX36 Conflict Target.md', 'WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS']) if (!runner.includes(token)) fail(`desktop runner token missing: ${token}`)
if (!packageJson.scripts?.['audit:ux36-file-tree-actions'] || !packageJson.scripts?.['check:ux36-file-tree-actions']) fail('package commands missing')
if (!packageJson.scripts?.['check:current-development-audit']?.includes('check-ux36-file-tree-actions')) fail('UX-36 checker is not in the development audit chain')

console.log('UX-36 file-tree actions passed: historical 18-format evidence remains immutable while the current registry exposes 28 grouped formats; rename safety stays aligned.')
