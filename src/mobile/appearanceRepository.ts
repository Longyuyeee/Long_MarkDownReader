import { isThemePreference, themePreferenceKey, type ThemePreference } from './settings.ts'

export const preferencesKey = 'longedit-mobile-preferences-v1'
export const preferencesLimit = 16 * 1024
export interface PreferencesSnapshot { content: string | null; revision: string }
export interface PreferencesStorage {
  readonly preview: boolean
  readPreferences(): Promise<PreferencesSnapshot>
  writePreferences(content: string, expectedRevision: string): Promise<PreferencesSnapshot>
}
type Preferences = { version: 1; theme: ThemePreference; [key: string]: unknown }
export type AppearancePhase = 'loading' | 'ready' | 'saving' | 'read-error' | 'save-error'
export interface AppearanceState { preference: ThemePreference; phase: AppearancePhase }

export function parsePreferences(raw: string): Preferences {
  if (new TextEncoder().encode(raw).length > preferencesLimit) throw Error('外观设置较大，原设置仍保留。')
  let value: unknown
  try { value = JSON.parse(raw) } catch { throw Error('外观设置无法读取，原设置仍保留。') }
  if (!value || typeof value !== 'object' || Array.isArray(value) || (value as Preferences).version !== 1 || !isThemePreference((value as Preferences).theme)) throw Error('外观设置版本无法核对，原设置仍保留。')
  return value as Preferences
}
function checked(snapshot: PreferencesSnapshot) {
  if (!snapshot || !(snapshot.content === null || typeof snapshot.content === 'string') || !(snapshot.content === null ? snapshot.revision === 'missing' : /^[a-f0-9]{64}$/.test(snapshot.revision))) throw Error('外观设置回复无法核对。')
  if (snapshot.content !== null) parsePreferences(snapshot.content)
  return snapshot
}
export async function readPreferences(store: PreferencesStorage, legacy: Pick<Storage, 'getItem'> = localStorage, explicitChoice = false): Promise<PreferencesSnapshot> {
  const native = checked(await store.readPreferences())
  if (native.content !== null) return native
  let old: string | null
  try { old = legacy.getItem(themePreferenceKey) } catch { throw Error('旧外观设置暂时无法读取，未创建默认设置。') }
  if (old === null) return native
  if (!isThemePreference(old)) {
    if (explicitChoice) return native // An explicit choice creates a separate record; the unknown old key stays intact.
    throw Error('旧外观设置无法核对，原设置仍保留。')
  }
  const content = JSON.stringify({ version: 1, theme: old })
  try {
    const saved = checked(await store.writePreferences(content, 'missing'))
    if (saved.content !== content) throw Error('外观迁移尚未确认。')
    return saved
  } catch (error) {
    const winner = checked(await store.readPreferences())
    if (winner.content === null) throw error
    return winner
  }
}

/** Apply immediately, serialize acknowledged writes, and let the newest explicit choice win. */
export function createAppearanceSession(store: PreferencesStorage, notify: (state: AppearanceState) => void, legacy?: Pick<Storage, 'getItem'>) {
  let preference: ThemePreference = 'system', phase: AppearancePhase = 'loading', generation = 0
  let snapshot: PreferencesSnapshot | null = null
  let pending: { theme: ThemePreference; generation: number } | null = null
  let job: Promise<boolean> = Promise.resolve(true)
  function publish(next: AppearancePhase) { phase = next; notify({ preference, phase }) }
  function enqueue(task: () => Promise<boolean>) {
    const next = job.then(task, task)
    job = next.catch(() => false)
    return next
  }
  async function loadNow(owner: number) {
    publish('loading')
    try {
      snapshot = await readPreferences(store, legacy)
      if (owner === generation && !pending) preference = snapshot.content === null ? 'system' : parsePreferences(snapshot.content).theme
      publish('ready')
      return true
    } catch { snapshot = null; publish('read-error'); return false }
  }
  async function saveNow(refresh = false): Promise<boolean> {
    if (!pending) return true
    publish('saving')
    try {
      if (refresh || !snapshot) snapshot = await readPreferences(store, legacy, true)
      while (pending) {
        const intent = { ...pending }
        const base = snapshot.content === null ? { version: 1 } : parsePreferences(snapshot.content)
        const content = JSON.stringify({ ...base, theme: intent.theme })
        parsePreferences(content)
        if (content !== snapshot.content) {
          const result = checked(await store.writePreferences(content, snapshot.revision))
          if (result.content !== content) throw Error('外观保存尚未确认。')
          snapshot = result
        }
        if (pending.generation === intent.generation) pending = null
      }
      publish('ready')
      return true
    } catch { publish('save-error'); return false }
  }
  function load() { const owner = generation; return enqueue(() => loadNow(owner)) }
  function choose(theme: ThemePreference) {
    if (!isThemePreference(theme)) throw Error('无效主题。')
    preference = theme; pending = { theme, generation: ++generation }
    publish('saving')
    return enqueue(() => saveNow())
  }
  function retry() { const owner = generation; return enqueue(() => pending ? saveNow(true) : loadNow(owner)) }
  async function flush() { await job; return pending === null && phase !== 'read-error' }
  return { load, choose, retry, flush }
}
