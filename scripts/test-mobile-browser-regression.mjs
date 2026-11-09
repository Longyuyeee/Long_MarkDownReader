import { spawnSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
const base = 'docs/evidence/mobile-0.1.0', output = `${base}/browser-regression-${Date.now()}`
mkdirSync(output, { recursive: true })
const scripts = ['browser','boundaries-browser','reading-browser','search-browser','attachments-browser','accessibility-browser','library-scale-browser','editor-browser','document-budget-browser','write-recovery-browser','creation-browser','text-export-browser','text-import-browser','incoming-browser','portable-pack-browser','pack-import-browser','pack-incoming-browser','external-packs-browser','json-source-browser','json-structure-browser','json-operations-browser','yaml-source-browser','yaml-structure-browser','xml-source-browser','xml-structure-browser','toml-source-browser','toml-design-browser','toml-structure-browser','code-source-browser','code-lines-browser','code-languages-browser','pdf-reading-browser','pdf-annotations-browser','pdf-recovery-browser','pdf-selection-browser','pdf-navigation-browser']
scripts.push('pdf-navigation-alignment-browser','pdf-bookmarks-browser','pdf-incoming-browser','pdf-gestures-browser','pdf-continuous-browser','pdf-orientation-browser','pdf-password-browser','pdf-permissions-browser')
const results = []
for (const suffix of scripts) {
  const file = `scripts/test-mobile-${suffix}.mjs`, prior = new Set(readdirSync(base))
  const run = spawnSync(process.execPath, [file], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
  writeFileSync(`${output}/${suffix}.log`, run.stdout + '\n' + run.stderr)
  const reports = readdirSync(base).filter(name => !prior.has(name) && name.startsWith(`${suffix}-`)).flatMap(name => {
    try { const report = JSON.parse(readFileSync(`${base}/${name}/report.json`)); return [{ directory: `${base}/${name}`, checks: report.checks?.length || 0, passed: report.passed, errors: report.errors, failure: report.failure, accessibility: report.accessibility }] } catch { return [] }
  })
  const passed = run.status === 0 && reports.length > 0 && reports.every(report => report.passed !== false && !report.failure && !(report.errors?.length))
  results.push({ file, exitCode: run.status, reports, passed }); console.log(`${suffix}: ${passed ? 'passed' : 'failed'}`)
  if (!passed) break
}
const passed = results.length === scripts.length && results.every(result => result.passed)
writeFileSync(`${output}/summary.json`, JSON.stringify({ results, groups: results.flatMap(result => result.reports).reduce((sum, report) => sum + report.checks, 0), passed, note: 'Legacy document-budget report omits passed: exit 0 confirms its assertions. Full logs/reports retained. Native Android checks run separately.' }, null, 2) + '\n')
console.log(output); if (!passed) process.exitCode = 1
