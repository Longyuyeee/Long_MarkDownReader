import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const history = fs.readFileSync('src-tauri/src/commands/history.rs', 'utf8')
function command(name) {
  const start = history.indexOf(`pub async fn ${name}(`)
  assert.ok(start >= 0, `missing history command: ${name}`)
  const end = history.indexOf('#[tauri::command]', start)
  return history.slice(start, end < 0 ? undefined : end)
}

// Wiring checks supplement (not replace) real Rust reader/writer and disk tests.
test('both UI history reads use shared coordination before resolving the document', () => {
  for (const name of ['list_history', 'get_history_metadata']) {
    const code = command(name)
    const lease = code.indexOf('history_coordination::acquire_read(')
    assert.ok(lease >= 0, `${name} must not be an unprotected read`)
    assert.ok(lease < code.indexOf('WorkspaceGuard::new('), `${name} must protect path resolution too`)
    assert.doesNotMatch(code, /let _lease = history_lease/)
  }
})

test('history mutations and signature-checked recovery retain exclusive coordination', () => {
  for (const name of ['save_history_version', 'save_external_history_version', 'set_history_metadata', 'delete_history_version', 'clear_all_history', 'prepare_history_restore', 'restore_history_copy']) {
    assert.match(command(name), /let _lease = history_lease\(&app_handle\)\?;/, name)
  }
  assert.match(command('prepare_history_restore'), /checked_comparison\(/)
  assert.match(command('restore_history_copy'), /checked_comparison\(/)
})
