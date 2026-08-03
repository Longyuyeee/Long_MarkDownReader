import fs from 'node:fs'

const read = path => fs.readFileSync(path, 'utf8')
const json = path => JSON.parse(read(path))
const pkg = json('package.json')
const tauri = json('src-tauri/tauri.conf.json')
const evidence = json('docs/evidence/v1.0.3-installed-hotfix/runtime.json')
const externalApps = read('src-tauri/src/commands/external_apps.rs')
const failures = []

if (pkg.version !== '1.0.3' || tauri.version !== pkg.version || evidence.appVersion !== pkg.version) failures.push('hotfix version identity drift')
if (tauri.app?.security?.dangerousDisableAssetCspModification?.join('|') !== 'style-src') failures.push('packaged dynamic style CSP exception drift')
if (!evidence.packagedUi?.naiveStyleApplied || evidence.packagedUi?.oversizedSvgCount !== 0 || evidence.packagedUi?.sampleIconWidthPx > 48) failures.push('installed UI geometry evidence failed')
if (evidence.environment?.displayScalePercent !== 200 || evidence.installedLifecycle?.upgradeFrom !== '1.0.2') failures.push('installed reproduction environment drift')
if (evidence.installedLifecycle?.observationSeconds < 15 || evidence.installedLifecycle?.regExeStarts !== 0) failures.push('console-free startup evidence failed')
if (!externalApps.includes('RegKey::predef') || !externalApps.includes('CREATE_NO_WINDOW') || /Command::new\(["']reg\.exe["']\)/i.test(externalApps)) failures.push('external application discovery regression')
if (evidence.artifacts?.length !== 2 || evidence.artifacts.some(artifact => !/^[0-9a-f]{64}$/.test(artifact.sha256) || artifact.bytes < 50_000_000)) failures.push('hotfix artifact receipt invalid')

if (failures.length) {
  console.error(failures.map(failure => `- ${failure}`).join('\n'))
  process.exit(1)
}
console.log('V1.0.3 installed hotfix passed: packaged UI restored and reg.exe-free startup verified at 200% Windows scaling.')
