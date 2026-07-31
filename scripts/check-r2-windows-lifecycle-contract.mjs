import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
const policy = JSON.parse(read('shared/windows-lifecycle-policy.json'))
const releaseMatrix = JSON.parse(read('shared/release-capability-matrix.json'))
const tauri = JSON.parse(read('src-tauri/tauri.conf.json'))
const packageJson = JSON.parse(read('package.json'))
const cargo = read('src-tauri/Cargo.toml')
const system = read('src-tauri/src/commands/system.rs')
const nsisHooks = read('src-tauri/windows/nsis-hooks.nsh')
const migration = read('src-tauri/src/services/data_migration.rs')
const lib = read('src-tauri/src/lib.rs')
const settings = read('src/views/SettingsView.vue')
const releaseCapabilities = read('src/config/releaseCapabilities.ts')
const failures = []

const failUnless = (condition, message) => {
  if (!condition) failures.push(message)
}
const sameJson = (left, right) => JSON.stringify(left) === JSON.stringify(right)

failUnless(policy.schemaVersion === 1 && policy.stage === 'R2', 'invalid R2 policy header')
failUnless(releaseMatrix.stage === policy.stage, 'product release stage must align with R2 lifecycle policy')
failUnless(
  releaseCapabilities.includes("['R1', 'R2'].includes(matrix.stage)"),
  'release capability runtime must accept the current R2 stage',
)
failUnless(policy.releaseCandidate === false, 'R2 must not claim release-candidate status')
failUnless(
  policy.appVersion === packageJson.version
    && policy.appVersion === tauri.version
    && new RegExp(`^version = "${policy.appVersion.replaceAll('.', '\\.')}"$`, 'm').test(cargo),
  'package, Tauri, Cargo, and lifecycle policy versions must match',
)
failUnless(/^default-run = "tauri-app"$/m.test(cargo), 'Tauri bundler must target the desktop app binary')
failUnless(
  policy.product.name === tauri.productName && policy.product.identifier === tauri.identifier,
  'product identity drift',
)
failUnless(
  sameJson(tauri.bundle.targets, policy.installer.targets),
  'installer target matrix drift',
)
failUnless(
  tauri.bundle.windows.allowDowngrades === policy.installer.allowDowngrades
    && policy.installer.allowDowngrades === false,
  'downgrade protection must remain enabled',
)
failUnless(
  tauri.bundle.windows.wix.upgradeCode === policy.installer.wixUpgradeCode,
  'stable WiX upgrade code drift',
)
failUnless(
  tauri.bundle.windows.nsis.installMode === policy.installer.nsisInstallMode
    && policy.installer.nsisInstallMode === 'currentUser',
  'NSIS must retain explicit current-user install mode',
)

const configuredAssociations = tauri.bundle.fileAssociations || []
const policyAssociations = policy.fileAssociations.groups || []
failUnless(configuredAssociations.length === policyAssociations.length, 'file association group count drift')
for (const group of policyAssociations) {
  const configured = configuredAssociations.find(item => item.name === 'LongEdit.Markdown')
  failUnless(
    group.id === 'markdown'
      && configured
      && configured.role === group.role
      && sameJson(configured.ext, group.extensions),
    `invalid file association whitelist group ${group.id}`,
  )
}
const associatedExtensions = new Set(configuredAssociations.flatMap(item => item.ext || []))
for (const extension of policy.fileAssociations.excludedDependencyFormats || []) {
  failUnless(!associatedExtensions.has(extension), `external dependency format must not be associated: ${extension}`)
}
failUnless(
  policy.fileAssociations.defaultSelectionOwner === 'windows'
    && policy.fileAssociations.directRegistryDefaultWrite === false
    && tauri.bundle.windows.nsis.installerHooks === 'windows/nsis-hooks.nsh'
    && nsisHooks.includes('NSIS_HOOK_POSTINSTALL')
    && nsisHooks.includes('NSIS_HOOK_POSTUNINSTALL')
    && nsisHooks.includes('OpenWithProgids')
    && nsisHooks.includes('LongEdit.Markdown_backup')
    && nsisHooks.includes('DeleteRegValue SHELL_CONTEXT "Software\\Classes\\.${EXT}" ""'),
  'Windows must own default app selection',
)
failUnless(
  system.includes('open_default_apps_settings')
    && system.includes('ms-settings:defaultapps')
    && !system.includes('Set-Item')
    && !system.includes('Set-ItemProperty')
    && !system.includes('HKEY_CURRENT_USER')
    && !system.includes('reg.exe'),
  'system command must open Windows settings without writing default associations',
)
failUnless(
  settings.includes("invoke('open_default_apps_settings')")
    && settings.includes('Long编辑不会覆盖现有选择')
    && !settings.includes('set_as_default_handler'),
  'settings default-app workflow drift',
)

for (const value of [
  'MigrationAction::Migrated',
  'MigrationAction::ConflictPreserved',
  'migration_moves_legacy_directory_without_overwriting',
  'migration_preserves_both_directories_on_conflict',
]) {
  failUnless(migration.includes(value), `migration contract missing ${value}`)
}
failUnless(
  migration.includes(policy.dataLifecycle.legacyIdentifier)
    && lib.includes('Legacy data migration conflict preserved')
    && lib.includes('Legacy data migration check failed'),
  'migration result must be surfaced instead of silently discarded',
)
failUnless(
  policy.dataLifecycle.knowledgeLibraries === 'external-user-data-never-removed'
    && policy.dataLifecycle.uninstallerCustomDeletion === false
    && policy.dataLifecycle.migrationConflictPolicy === 'preserve-both-and-report',
  'data retention boundary drift',
)

if (failures.length) {
  console.error(failures.map(failure => `- ${failure}`).join('\n'))
  process.exit(1)
}

console.log(
  `R2 Windows lifecycle contract passed: ${tauri.bundle.targets.join('/')} installers, `
    + `${associatedExtensions.size} associated extensions, stable upgrade ${policy.installer.wixUpgradeCode}`,
)
