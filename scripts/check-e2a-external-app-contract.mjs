import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const read = path => readFile(new URL(path, root), 'utf8')
const [contractText, backend, commandModule, tauriLib, library] = await Promise.all([
  read('shared/external-application-capabilities.json'),
  read('src-tauri/src/commands/external_apps.rs'),
  read('src-tauri/src/commands/mod.rs'),
  read('src-tauri/src/lib.rs'),
  read('src/views/LibraryMode.vue'),
])
const contract = JSON.parse(contractText)
const backendRuntime = backend.split('#[cfg(test)]')[0]
const backendLower = backend.toLowerCase()
const failures = []
const requireText = (source, value, message) => {
  if (!source.includes(value)) failures.push(message)
}

if (contract.schemaVersion !== 1 || contract.stage !== 'E2A') failures.push('E2A external application contract identity drift')
if (contract.policies?.workspaceFilesOnly !== true
  || contract.policies?.fixedInstallPathsAllowed !== false
  || contract.policies?.arbitraryExecutablePathsAllowed !== false
  || contract.policies?.sourceDigestRequiredAtHandoff !== true) failures.push('E2A external application safety policy drift')

const applications = new Map((contract.applications || []).map(application => [application.id, application]))
for (const id of ['microsoft-office', 'wps-office', 'libreoffice']) {
  if (!applications.has(id)) failures.push(`E2A application definition missing: ${id}`)
}
const executableNames = new Set((contract.applications || [])
  .flatMap(application => application.executables || [])
  .map(executable => executable.fileName.toLowerCase()))
for (const fileName of ['winword.exe', 'excel.exe', 'powerpnt.exe', 'wps.exe', 'et.exe', 'wpp.exe', 'soffice.exe']) {
  if (!executableNames.has(fileName)) failures.push(`E2A executable role missing: ${fileName}`)
  requireText(backendLower, `"${fileName}`, `E2A runtime executable mapping missing: ${fileName}`)
}
const wpsExtensions = new Set(applications.get('wps-office')?.executables
  ?.flatMap(executable => executable.supportedExtensions || []))
for (const extension of ['.wps', '.et', '.dps']) {
  if (!wpsExtensions.has(extension)) failures.push(`E2A WPS routing extension missing: ${extension}`)
}
const wpsRoles = new Map(applications.get('wps-office')?.executables
  ?.map(executable => [executable.role, executable]))
for (const role of ['spreadsheet', 'presentation']) {
  if (!wpsRoles.get(role)?.acceptedFileNames?.includes('wps.exe')) failures.push(`E2A WPS unified launcher alias missing: ${role}`)
}

requireText(backend, 'windows-app-paths:', 'E2A Windows discovery must query registered App Paths')
requireText(backend, 'where.exe', 'E2A discovery must retain PATH fallback without fixed install directories')
requireText(backend, 'VersionInfo.ProductVersion', 'E2A discovery must report executable product versions')
requireText(backend, 'normalize_discovered_executable', 'E2A discovery must canonicalize and bind executable file names')
requireText(backend, 'WorkspaceGuard::new(library_root)', 'E2A external open must remain workspace-scoped')
requireText(backend, 'file_format_for_path(&path)', 'E2A external open must consume the shared format registry')
requireText(backend, 'application_id: Option<String>', 'E2A command may accept only a discovered application identity')
requireText(backend, 'discover_all()', 'E2A selected applications must be resolved from fresh discovery')
requireText(backend, 'resolve_external_application', 'E2A application identity and role diagnostics must remain centralized')
requireText(backend, 'accepted_file_names: &["et.exe", "wps.exe"]', 'E2A runtime WPS spreadsheet launcher alias missing')
requireText(backend, 'accepted_file_names: &["wpp.exe", "wps.exe"]', 'E2A runtime WPS presentation launcher alias missing')
requireText(backend, '.open_path(', 'E2A open must use the existing Tauri opener')
requireText(backend, 'source_sha256_before == source_sha256_after_handoff', 'E2A open must verify source digest stability at handoff')
requireText(backend, 'source_digest_is_stable_and_read_only', 'E2A source preservation must have a Rust regression')
if (/Program Files|ProgramData|AppData[\\/]+Local[\\/]+Kingsoft/i.test(backendRuntime)) failures.push('E2A backend reintroduced a fixed install path')

requireText(commandModule, 'pub mod external_apps;', 'E2A command module is not exported')
requireText(tauriLib, 'discover_external_applications', 'E2A discovery command is not registered')
requireText(tauriLib, 'open_workspace_file_externally', 'E2A unified open command is not registered')
requireText(library, 'externalOpenOptions', 'E2A right-pane application menu is missing')
requireText(library, '使用外部应用打开', 'E2A external open command is not visible in the shared workspace')
requireText(library, "'discover_external_applications'", 'E2A Library must invoke backend discovery')
requireText(library, "'open_workspace_file_externally'", 'E2A Library must invoke the guarded open command')
requireText(library, 'sourcePreservedAtHandoff', 'E2A Library must consume source preservation receipts')
requireText(library, "key: 'external-open-menu'", 'E2A file-tree context menu must reuse unified external open')

if (failures.length) {
  console.error(`E2A external application contract check failed:\n- ${failures.join('\n- ')}`)
  process.exitCode = 1
} else {
  console.log(`E2A external application contract passed: ${applications.size} suites, ${executableNames.size} role executables, guarded default/specific open and source-preserving handoff.`)
}
