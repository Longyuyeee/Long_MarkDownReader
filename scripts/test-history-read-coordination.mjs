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
  const list = command('list_history')
  assert.ok(list.indexOf('history_coordination::acquire_read(') >= 0)
  assert.ok(list.indexOf('history_coordination::acquire_read(') < list.indexOf('WorkspaceGuard::new('))
  assert.doesNotMatch(list, /let _lease = history_lease/)
  const metadata = command('get_history_metadata')
  assert.match(metadata, /read_coordinated_metadata\(&history_cache_root\(&app_handle\)\?, \|\|/)
  assert.ok(metadata.indexOf('read_coordinated_metadata(') < metadata.indexOf('WorkspaceGuard::new('))
  const helper = history.slice(history.indexOf('fn read_coordinated_metadata('), history.indexOf('pub async fn get_history_metadata('))
  assert.ok(helper.indexOf('history_coordination::acquire_read(') < helper.indexOf('let directory = resolve_directory()?'))
  assert.match(helper, /history_coordination::acquire\(cache\)\?;\s*let directory = resolve_directory\(\)\?/)
  assert.match(helper, /read_metadata_for_update\(&directory\)/)
})

test('history mutations and signature-checked recovery retain exclusive coordination', () => {
  for (const name of ['save_history_version', 'save_external_history_version', 'set_history_metadata', 'delete_history_version', 'clear_all_history', 'prepare_history_restore', 'restore_history_copy']) {
    assert.match(command(name), /let _lease = history_lease\(&app_handle\)\?;/, name)
  }
  assert.match(command('prepare_history_restore'), /checked_comparison\(/)
  assert.match(command('restore_history_copy'), /checked_comparison\(/)
})
