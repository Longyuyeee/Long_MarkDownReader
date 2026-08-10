import fs from 'node:fs'
import { hasEa5cRequirementAcceptance } from './lib/ea5c-requirement-acceptance.mjs'

const read = path => fs.readFileSync(path, 'utf8')
const fail = message => {
  console.error(message)
  process.exit(1)
}

const workspaces = [
  {
    label: 'TXT',
    path: 'src/views/TextEditorView.vue',
    tabClass: 'text-tabs',
    areas: ['tabs', 'toolbar', 'format', 'editor', 'status'],
    assignments: [
      '.text-tabs { grid-area: tabs; }',
      '.text-toolbar { grid-area: toolbar; }',
      '.format-bar { grid-area: format; }',
      '.editor-stage { grid-area: editor; }',
      '.status-bar { grid-area: status; }',
    ],
  },
  {
    label: 'LOG',
    path: 'src/views/LogViewerView.vue',
    tabClass: 'log-tabs',
    areas: ['tabs', 'toolbar', 'filter', 'viewer', 'status'],
    assignments: [
      '.log-tabs { grid-area: tabs; }',
      '.log-toolbar { grid-area: toolbar; }',
      '.filter-bar { grid-area: filter; }',
      '.log-stage { grid-area: viewer; }',
      '.status-bar { grid-area: status; }',
    ],
  },
]

for (const workspace of workspaces) {
  const source = read(workspace.path)
  if (!source.includes(`class="${workspace.tabClass}"`)) fail(`${workspace.label} tabs do not own a stable grid area.`)
  for (const area of workspace.areas) {
    if (!source.includes(`"${area}"`)) fail(`${workspace.label} grid template is missing ${area}.`)
  }
  for (const assignment of workspace.assignments) {
    if (!source.includes(assignment)) fail(`${workspace.label} grid assignment is missing: ${assignment}`)
  }
  if (!/grid-template-rows:[^;]*minmax\(0, 1fr\)[^;]*28px;/.test(source)) {
    fail(`${workspace.label} must reserve the remaining height for content and a fixed compact status row.`)
  }
  if (!/\.\w+-workspace\s*\{[^}]*min-height:\s*0;/s.test(source)) fail(`${workspace.label} workspace must be allowed to shrink inside the library shell.`)
  if (!/\.status-bar\s*\{[^}]*overflow:\s*hidden;[^}]*white-space:\s*nowrap;/s.test(source)) {
    fail(`${workspace.label} status bar must stay on one compact line.`)
  }
}

const library = read('src/views/LibraryMode.vue')
if (!/\.library-embedded-editor\s*\{[^}]*min-height:\s*0;[^}]*flex:\s*1;/s.test(library)) {
  fail('The library embedded-editor host no longer guarantees the remaining height to its active editor.')
}

const audit = read('docs/User_Experience_Closure_Audit_2026-08-04.md')
if (!hasEa5cRequirementAcceptance('UX-22', audit)) fail('UX-22 is missing its EA-5C accepted evidence boundary.')

console.log('TXT and LOG use stable named grid areas; editor/viewer keeps remaining height and status stays compact.')
