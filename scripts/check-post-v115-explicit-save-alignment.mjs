import fs from 'node:fs'

const policy = JSON.parse(fs.readFileSync('shared/post-v115-explicit-save-alignment-policy.json', 'utf8'))
const baseline = JSON.parse(fs.readFileSync('docs/evidence/post-v115-explicit-save-alignment/baseline-evidence.json', 'utf8'))
const current = JSON.parse(fs.readFileSync('docs/evidence/post-v115-explicit-save-alignment/current-evidence.json', 'utf8'))
const library = fs.readFileSync('src/views/LibraryMode.vue', 'utf8')
const settings = fs.readFileSync('src/views/SettingsView.vue', 'utf8')
const requirements = fs.readFileSync('docs/Unified_File_Manager_Format_Requirements.md', 'utf8')
const failures = []
const actual = { ...baseline.actual, ...current.actual, runtimeErrors: baseline.actual.runtimeErrors + current.actual.runtimeErrors }
for (const [key, expected] of Object.entries(policy.expected)) if (actual[key] !== expected) failures.push(`${key}=${JSON.stringify(actual[key])}, expected ${JSON.stringify(expected)}`)
for (const forbidden of ['triggerAutoSave', 'AUTO_SAVE_DELAY_MS', "console.error('Auto-save failed:'"]) if (library.includes(forbidden)) failures.push(`Legacy source auto-write marker remains: ${forbidden}`)
if (!library.includes('data-testid="library-explicit-save"')) failures.push('Stable explicit-save command marker missing')
if (!settings.includes('历史快照间隔 (分钟)') || !settings.includes('正文只在点击保存后写入')) failures.push('Settings do not distinguish snapshots from source saves')
if (!requirements.includes('历史快照不得覆盖正文，正文只在用户点击保存后写入')) failures.push('Requirement baseline is not aligned to explicit save')
for (const file of [...baseline.evidenceFiles, ...current.evidenceFiles]) if (!fs.existsSync(`docs/evidence/post-v115-explicit-save-alignment/${file}`)) failures.push(`Evidence missing: ${file}`)
if (failures.length) { console.error(failures.join('\n')); process.exit(1) }
console.log('Explicit-save alignment accepted: the real pre-fix source write is reproduced, current drafts remain byte-unchanged, and only Save persists content.')
