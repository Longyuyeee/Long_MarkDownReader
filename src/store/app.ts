import { defineStore } from 'pinia'
import { enable, disable, isEnabled } from '@tauri-apps/plugin-autostart'
import { invoke, invokeWithTimeout, isTauriRuntime, withTimeout } from '../services/tauriRuntime'
import {
  THEME_EDITOR_BACKGROUNDS,
  getThemePreset,
  normalizeThemeName,
  type ThemeMotionSpeed,
  type ThemeName,
  type VisualStyle,
} from '../config/themePresets'
import { toCollectionRelativePath } from '../utils/savedCollections'
import type { FileDisplayStyle } from '../config/fileTreeAppearance'
import { fileStylePathKey, normalizeFileDisplayStyles, moveFileDisplayStyleEntries, copyFileDisplayStyleEntries } from '../utils/fileDisplayStyles'
import { normalizeDisplayPreferences } from '../config/displayPreferences'
import { belongsToLibrary, libraryTabsKey, sessionTabs } from '../utils/workSessions'
import { emit } from '@tauri-apps/api/event'
import { BLANK_NOTE_TEMPLATE, BUILTIN_NOTE_TEMPLATES, MAX_NOTE_TEMPLATES, validateNoteTemplate, type NoteTemplate } from '../config/noteTemplates'

export type SessionMode = 'TEMP' | 'LIBRARY'

export const THEME_MAP = THEME_EDITOR_BACKGROUNDS

export interface TabInfo {
  id: string
  title: string
  path: string
  isDirty: boolean
  content?: string
  textSignature?: string
  textContentDigest?: string
  textEncoding?: string
  textBom?: string
  textLineEnding?: string
  textHasFinalNewline?: boolean
  textReadEncoding?: string
  textReadOnlyReason?: string
  textLoadError?: string
  textRangeNextOffset?: number
  textRangeEof?: boolean
  textSize?: number
  textModified?: number
  textEncodingConfidence?: string
  textSaveEncoding?: string
  textSaveBom?: string
  textSaveLineEnding?: string
  textSaveFinalNewline?: boolean
  external?: boolean
}

export interface LibraryConfig {
  name: string
  path: string
  inboxDirectory?: string
  gitEnabled?: boolean
  gitRemote?: string
  gitBranch?: string
}

export interface CollectionFilters {
  directory: string
  tag: string
  modifiedWithinDays: number | null
}
export interface SavedSearchConfig {
  id: string
  name: string
  query: string
  libraryPath: string
  objectTypes: string[]
  filters?: CollectionFilters | null
  graphRoot?: string
  graphDepth?: number
  createdAt: number
}

export interface RelationObjectFocus {
  path: string
  locatorKind: string
  locatorObjectId: string
  locatorPage?: number
}

const TABS_STORAGE_KEY = 'longedit_tabs_state'
const GRAPH_COLLECTION_QUERY = '__longedit_graph_collection__'
let configLoadPromise: Promise<void> | null = null
let configWritePromise: Promise<void> = Promise.resolve()

export const useAppStore = defineStore('app', {
  state: () => ({
    activeSession: 'LIBRARY' as SessionMode,
    tabs: [] as TabInfo[],
    activeTabId: null as string | null,
    theme: 'system' as ThemeName,
    codeTheme: 'github' as string,
    editorMode: 'wysiwyg' as 'wysiwyg' | 'ir' | 'sv',
    editorModeExplicit: false,
    editorBgColor: '' as string,
    heroIcon: 'BookOpen' as string,
    libraries: [] as LibraryConfig[],
    activeLibraryPath: '',
    autoSaveInterval: 3,
    textAutoSaveEnabled: true,
    maxHistoryCount: 10,
    isAutostart: false,
    exitStrategy: 'ask' as 'ask' | 'quit' | 'minimize',
    isTempDirty: false,
    isCaptureBusy: false,
    isZen: false,
    visualStyle: 'soft' as VisualStyle,
    motionSpeed: 'calm' as ThemeMotionSpeed,
    displayPreferences: normalizeDisplayPreferences(undefined),
    aiEnabled: false,
    aiProvider: 'openai',
    aiEndpoint: 'https://api.openai.com/v1',
    aiCredentialStored: false,
    aiModel: 'gpt-4o-mini',
    recentFiles: [] as { title: string; path: string }[],
    starredFiles: [] as string[],
    savedSearches: [] as SavedSearchConfig[],
    noteTemplates: [] as NoteTemplate[],
    defaultNoteTemplates: {} as Record<string, string>,
    fileDisplayStyles: {} as Record<string, FileDisplayStyle>,
    relationObjectFocus: null as RelationObjectFocus | null,
    configReady: false,
  }),
  getters: {
    allNoteTemplates: state => [...BUILTIN_NOTE_TEMPLATES, ...state.noteTemplates],
    fileDisplayStylesByPath: state => normalizeFileDisplayStyles(state.fileDisplayStyles),
    fileDisplayStyleForPath(): (path: string) => FileDisplayStyle | undefined {
      return path => this.fileDisplayStylesByPath[fileStylePathKey(path)]
    },
    libraryPath: (state) => state.activeLibraryPath,
    currentLibraryName: (state) => {
      const lib = state.libraries.find(l => l.path === state.activeLibraryPath)
      return lib ? lib.name : '未关联文件库'
    }
  },
  actions: {
    setRelationObjectFocus(focus: RelationObjectFocus) {
      this.relationObjectFocus = focus
    },
    clearRelationObjectFocus(path?: string) {
      if (!path || this.relationObjectFocus?.path === path) this.relationObjectFocus = null
    },
    async loadConfig() {
      if (this.configReady) return
      if (configLoadPromise) return configLoadPromise
      configLoadPromise = (async () => {
        try {
          if (!isTauriRuntime()) {
            this.restoreTabsState()
            return
          }
          const config = await invokeWithTimeout<any>('get_config', undefined, 4000)
          this.libraries = (config.libraries || []).map((l: any) => ({ ...l, gitEnabled: l.gitEnabled || false, gitRemote: l.gitRemote || '', gitBranch: l.gitBranch || 'main' }))
          this.activeLibraryPath = config.activeLibraryPath || ''
          this.theme = normalizeThemeName(config.theme)
          this.codeTheme = config.codeTheme || 'github'
          this.editorModeExplicit = config.editorModeExplicit === true
          this.editorMode = this.editorModeExplicit && ['wysiwyg', 'ir', 'sv'].includes(config.editorMode)
            ? config.editorMode
            : 'wysiwyg'
          this.editorBgColor = config.editorBgColor || ''
          this.heroIcon = config.heroIcon || 'BookOpen'
          this.autoSaveInterval = config.autoSaveInterval || 3
          this.textAutoSaveEnabled = config.textAutoSaveEnabled !== false
          this.maxHistoryCount = config.maxHistoryCount || 10
          this.exitStrategy = config.exitStrategy || 'ask'
          this.visualStyle = config.visualStyle || 'soft'
          this.motionSpeed = config.motionSpeed || 'calm'
          this.displayPreferences = normalizeDisplayPreferences(config.displayPreferences)
          this.aiEnabled = config.aiEnabled || false
          this.aiProvider = config.aiProvider || 'openai'
          this.aiEndpoint = config.aiEndpoint || 'https://api.openai.com/v1'
          try { this.aiCredentialStored = await invokeWithTimeout<boolean>('get_ai_credential_status', undefined, 2000) }
          catch { this.aiCredentialStored = false }
          this.aiModel = config.aiModel || 'gpt-4o-mini'
          this.savedSearches = Array.isArray(config.savedSearches) ? config.savedSearches : []
          this.noteTemplates = Array.isArray(config.noteTemplates) ? config.noteTemplates : []
          this.defaultNoteTemplates = config.defaultNoteTemplates || {}
          this.fileDisplayStyles = normalizeFileDisplayStyles(config.fileDisplayStyles && typeof config.fileDisplayStyles === 'object' ? config.fileDisplayStyles : {})

          // 同步系统真实的自启状态，以系统为准
          try {
            this.isAutostart = await withTimeout(isEnabled(), 2000, 'autostart:isEnabled')
          } catch (e) {
            this.isAutostart = config.isAutostart || false
          }

          // 恢复上一次的标签页
          this.restoreTabsState()
        } catch (e) {
          console.error('Failed to load config', e)
          this.restoreTabsState()
        } finally {
          this.configReady = true
        }
      })()
      try { await configLoadPromise }
      finally { configLoadPromise = null }
    },
    async setInboxDirectory(root: string, path: string) {
      const relative = await invoke<string>('validate_inbox_location', { libraryRoot: root, path })
      if (!this.libraries.some(item => item.path === root)) throw new Error('资料库已移除')
      await this.updateConfig({ libraries: this.libraries.map(item => item.path === root ? { ...item, inboxDirectory: relative } : item) })
      return relative
    },
    async updateConfig(patch: any) {
      // Queue immutable snapshots; failed persistence must not discard open work.
      const snapshot = JSON.parse(JSON.stringify(patch))
      const task = configWritePromise.then(async () => {
        const switchesLibrary = snapshot.activeLibraryPath !== undefined && snapshot.activeLibraryPath !== this.activeLibraryPath
        const previousAutostart = this.isAutostart
        let autostartChanged = false
        const next = { ...this.$state, ...snapshot }
        if (snapshot.libraries !== undefined) {
          const libraryPaths = new Set(next.libraries.map((library: LibraryConfig) => library.path))
          next.savedSearches = next.savedSearches.filter((search: SavedSearchConfig) => libraryPaths.has(search.libraryPath))
        }
        try {
          if (isTauriRuntime() && snapshot.isAutostart !== undefined && snapshot.isAutostart !== previousAutostart) {
            if (snapshot.isAutostart) await enable()
            else await disable()
            autostartChanged = true
          }
          if (isTauriRuntime()) {
            await invoke('save_config', { config: {
              libraries: next.libraries,
              activeLibraryPath: next.activeLibraryPath,
              theme: next.theme,
              codeTheme: next.codeTheme,
              editorMode: next.editorMode,
              editorModeExplicit: next.editorModeExplicit,
              editorBgColor: next.editorBgColor,
              heroIcon: next.heroIcon,
              autoSaveInterval: next.autoSaveInterval,
              textAutoSaveEnabled: next.textAutoSaveEnabled,
              maxHistoryCount: next.maxHistoryCount,
              isAutostart: next.isAutostart,
              exitStrategy: next.exitStrategy,
              visualStyle: next.visualStyle,
              motionSpeed: next.motionSpeed,
              displayPreferences: normalizeDisplayPreferences(next.displayPreferences),
              aiEnabled: next.aiEnabled,
              aiProvider: next.aiProvider,
              aiEndpoint: next.aiEndpoint,
              aiModel: next.aiModel,
              savedSearches: next.savedSearches,
              fileDisplayStyles: next.fileDisplayStyles,
              noteTemplates: next.noteTemplates,
              defaultNoteTemplates: next.defaultNoteTemplates,
            } })
          }
        } catch (error) {
          if (autostartChanged) {
            try { if (previousAutostart) await enable(); else await disable() }
            catch (rollbackError) { throw new Error(`配置未保存，恢复开机启动设置也失败：${String(error)}；${String(rollbackError)}`) }
          }
          throw error
        }
        const applied = { ...snapshot }
        if (snapshot.displayPreferences !== undefined) applied.displayPreferences = normalizeDisplayPreferences(snapshot.displayPreferences)
        if (snapshot.libraries !== undefined) applied.savedSearches = next.savedSearches
        if (switchesLibrary) {
          this.saveTabsState()
          applied.tabs = []
          applied.recentFiles = []
          applied.starredFiles = []
          applied.activeTabId = null
          applied.relationObjectFocus = null
        }
        this.$patch(applied)
        // Pinia object patches merge nested maps; deleted file markers must not survive.
        if (snapshot.fileDisplayStyles !== undefined) this.fileDisplayStyles = snapshot.fileDisplayStyles
        if (snapshot.defaultNoteTemplates !== undefined) this.defaultNoteTemplates = snapshot.defaultNoteTemplates
        if (switchesLibrary) this.restoreTabsState()
        if (!isTauriRuntime()) this.saveTabsState()
        if (isTauriRuntime() && (snapshot.noteTemplates !== undefined || snapshot.defaultNoteTemplates !== undefined)) {
          try { await emit('note-templates-changed', { noteTemplates: this.noteTemplates, defaultNoteTemplates: this.defaultNoteTemplates }) }
          catch (error) { console.warn('Templates saved; other windows will refresh when reopened', error) }
        }
      })
      configWritePromise = task.catch(() => {})
      return task
    },
    async saveNoteTemplate(template: NoteTemplate) {
      const entry = validateNoteTemplate(template, this.allNoteTemplates)
      const exists = this.noteTemplates.some(item => item.id === entry.id)
      if (!exists && this.noteTemplates.length >= MAX_NOTE_TEMPLATES) throw new Error('自定义模板不能超过 64 个')
      await this.updateConfig({ noteTemplates: exists ? this.noteTemplates.map(item => item.id === entry.id ? entry : item) : [...this.noteTemplates, entry] })
    },
    async deleteNoteTemplate(id: string) {
      const defaults = Object.fromEntries(Object.entries(this.defaultNoteTemplates).filter(([, value]) => value !== id))
      await this.updateConfig({ noteTemplates: this.noteTemplates.filter(item => item.id !== id), defaultNoteTemplates: defaults })
    },
    async setDefaultNoteTemplate(root: string, id: string) {
      if (!this.libraries.some(item => item.path === root)) throw new Error('资料库已移除')
      if (!this.allNoteTemplates.some(item => item.id === id)) throw new Error('模板已不存在')
      const defaults = { ...this.defaultNoteTemplates }
      if (id === BLANK_NOTE_TEMPLATE) delete defaults[root]
      else defaults[root] = id
      await this.updateConfig({ defaultNoteTemplates: defaults })
    },
    async applyThemePreset(presetId: string) {
      const selected = getThemePreset(presetId)
      if (!selected) throw new Error(`Unknown theme preset: ${presetId}`)
      await this.updateConfig({
        theme: selected.theme,
        visualStyle: selected.style,
        codeTheme: selected.vditorCodeTheme,
        editorBgColor: THEME_MAP[selected.theme],
        motionSpeed: selected.motionSpeed,
      })
    },
    async saveAiCredential(apiKey: string) {
      await invoke('set_ai_credential', { apiKey })
      this.aiCredentialStored = true
    },
    async clearAiCredential() {
      await invoke('clear_ai_credential')
      this.aiCredentialStored = false
    },
    async addSavedSearch(query: string, objectTypes: string[] = []) {
      const normalizedQuery = query.trim()
      if (!normalizedQuery || !this.activeLibraryPath) throw new Error('搜索查询或知识库为空')
      const normalizedTypes = [...new Set(objectTypes)].sort()
      const duplicate = this.savedSearches.find(search => !search.graphRoot && !search.filters
        && search.libraryPath === this.activeLibraryPath
        && search.query.toLowerCase() === normalizedQuery.toLowerCase()
        && [...search.objectTypes].sort().join('|') === normalizedTypes.join('|'))
      if (duplicate) return duplicate
      if (this.savedSearches.length >= 64) throw new Error('保存的搜索不能超过 64 个')
      const savedSearch: SavedSearchConfig = {
        id: `search-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: normalizedQuery.slice(0, 80),
        query: normalizedQuery.slice(0, 500),
        libraryPath: this.activeLibraryPath,
        objectTypes: normalizedTypes.slice(0, 8),
        graphRoot: undefined,
        graphDepth: undefined,
        createdAt: Date.now(),
      }
      const previous = this.savedSearches
      await this.updateConfig({ savedSearches: [savedSearch, ...previous] })
      return savedSearch
    },
    async saveSmartCollection(input: { id?: string; name: string; query: string; objectTypes: string[]; filters: CollectionFilters }) {
      const root = this.activeLibraryPath
      if (!root || !input.name.trim()) throw new Error('请填写集合名称')
      const existing = input.id ? this.savedSearches.find(item => item.id === input.id && item.libraryPath === root && !item.graphRoot) : undefined
      if (input.id && !existing) throw new Error('集合已删除或资料库已切换，请重新打开')
      if (!existing && this.savedSearches.length >= 64) throw new Error('保存的搜索不能超过 64 个')
      const entry: SavedSearchConfig = {
        id: existing?.id || `collection-${crypto.randomUUID()}`, name: input.name.trim(),
        query: input.query.trim(), libraryPath: root, objectTypes: [...new Set(input.objectTypes)].sort(),
        filters: { ...input.filters }, createdAt: existing?.createdAt || Date.now(),
      }
      await this.updateConfig({ savedSearches: existing
        ? this.savedSearches.map(item => item.id === existing.id ? entry : item)
        : [entry, ...this.savedSearches] })
      return entry
    },
    async setFileDisplayStyle(path: string, style: FileDisplayStyle) {
      const previous = this.fileDisplayStyles
      const next = { ...normalizeFileDisplayStyles(previous), [fileStylePathKey(path)]: style }
      await this.updateConfig({ fileDisplayStyles: next })
    },
    async clearFileDisplayStyle(path: string) {
      const key = fileStylePathKey(path)
      const previous = this.fileDisplayStyles
      const next = normalizeFileDisplayStyles(previous)
      if (!next[key]) return
      delete next[key]
      await this.updateConfig({ fileDisplayStyles: next })
    },
    async moveFileDisplayStyles(oldPath: string, newPath: string) {
      const oldKey = fileStylePathKey(oldPath)
      if (!Object.keys(this.fileDisplayStyles).some(path => fileStylePathKey(path) === oldKey || fileStylePathKey(path).startsWith(`${oldKey}/`))) return
      const next = moveFileDisplayStyleEntries(this.fileDisplayStyles, oldPath, newPath)
      try { await this.updateConfig({ fileDisplayStyles: next }) }
      catch (error) {
        // The file has already moved; keep its appearance at the real location.
        this.fileDisplayStyles = next
        throw error
      }
    },
    async copyFileDisplayStyles(oldPath: string, newPath: string) {
      const next = copyFileDisplayStyleEntries(this.fileDisplayStyles, oldPath, newPath)
      try { await this.updateConfig({ fileDisplayStyles: next }) }
      catch (error) { this.fileDisplayStyles = next; throw error }
    },
    async removeFileDisplayStyles(paths: string[]) {
      const next = normalizeFileDisplayStyles(this.fileDisplayStyles)
      const keys = paths.map(fileStylePathKey)
      let changed = false
      for (const candidate of Object.keys(next)) {
        if (keys.some(path => candidate === path || candidate.startsWith(`${path}/`))) {
          delete next[candidate]
          changed = true
        }
      }
      if (changed) {
        await this.updateConfig({ fileDisplayStyles: next })
      }
    },
    async addGraphCollection(name: string, centerPath: string, depth: number) {
      if (!this.activeLibraryPath) throw new Error('知识库为空')
      const graphRoot = toCollectionRelativePath(this.activeLibraryPath, centerPath)
      const graphDepth = Math.min(4, Math.max(1, Math.trunc(depth)))
      const duplicate = this.savedSearches.find(search => search.libraryPath === this.activeLibraryPath
        && search.graphRoot?.toLowerCase() === graphRoot.toLowerCase()
        && search.graphDepth === graphDepth)
      if (duplicate) return duplicate
      if (this.savedSearches.length >= 64) throw new Error('保存的搜索不能超过 64 个')
      const savedSearch: SavedSearchConfig = {
        id: `graph-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: name.trim().slice(0, 80) || '图谱集合',
        query: GRAPH_COLLECTION_QUERY,
        libraryPath: this.activeLibraryPath,
        objectTypes: [],
        graphRoot,
        graphDepth,
        createdAt: Date.now(),
      }
      const previous = this.savedSearches
      await this.updateConfig({ savedSearches: [savedSearch, ...previous] })
      return savedSearch
    },
    async removeSavedSearch(id: string) {
      const previous = this.savedSearches
      await this.updateConfig({ savedSearches: previous.filter(search => search.id !== id) })
    },
    addTab(tab: TabInfo) {
      const idx = this.tabs.findIndex(t => t.path === tab.path)
      if (idx > -1) {
        const existing = this.tabs[idx]
        if (tab.content !== undefined) existing.content = tab.content
        if (tab.textSignature !== undefined) existing.textSignature = tab.textSignature
        if (tab.textContentDigest !== undefined) existing.textContentDigest = tab.textContentDigest
        if (tab.textEncoding !== undefined) existing.textEncoding = tab.textEncoding
        if (tab.textBom !== undefined) existing.textBom = tab.textBom
        if (tab.textLineEnding !== undefined) existing.textLineEnding = tab.textLineEnding
        if (tab.textHasFinalNewline !== undefined) existing.textHasFinalNewline = tab.textHasFinalNewline
        if (tab.textReadEncoding !== undefined) existing.textReadEncoding = tab.textReadEncoding
        if (tab.textReadOnlyReason !== undefined) existing.textReadOnlyReason = tab.textReadOnlyReason
        if (tab.textRangeNextOffset !== undefined) existing.textRangeNextOffset = tab.textRangeNextOffset
        if (tab.textRangeEof !== undefined) existing.textRangeEof = tab.textRangeEof
        if (tab.textSize !== undefined) existing.textSize = tab.textSize
        if (tab.textModified !== undefined) existing.textModified = tab.textModified
        if (tab.textEncodingConfidence !== undefined) existing.textEncodingConfidence = tab.textEncodingConfidence
        if (tab.textSaveEncoding !== undefined) existing.textSaveEncoding = tab.textSaveEncoding
        if (tab.textSaveBom !== undefined) existing.textSaveBom = tab.textSaveBom
        if (tab.textSaveLineEnding !== undefined) existing.textSaveLineEnding = tab.textSaveLineEnding
        if (tab.textSaveFinalNewline !== undefined) existing.textSaveFinalNewline = tab.textSaveFinalNewline
        if (tab.external !== undefined) existing.external = tab.external
        // Activation preserves the user's spatial order; only recent-files is MRU.
        if (this.activeTabId !== existing.id) {
          this.activeTabId = existing.id
        }
      } else {
        this.tabs.push(tab)
        this.activeTabId = tab.id
      }
      // 最近文件追踪
      if (!tab.external) {
        this.recentFiles = this.recentFiles.filter(f => f.path !== tab.path)
        this.recentFiles.unshift({ title: tab.title, path: tab.path })
        if (this.recentFiles.length > 10) this.recentFiles = this.recentFiles.slice(0, 10)
      }
      this.saveTabsState()
    },
    recordRecentFile(file: { title: string; path: string }) {
      if (!file.path) return
      this.recentFiles = this.recentFiles.filter(item => item.path !== file.path)
      this.recentFiles.unshift(file)
      if (this.recentFiles.length > 10) this.recentFiles = this.recentFiles.slice(0, 10)
      this.saveTabsState()
    },
    updateTabContent(path: string, content: string) {
      const tab = this.tabs.find(t => t.path === path)
      if (tab) tab.content = content
    },
    activateTab(tabId: string | null) {
      if (tabId && !this.tabs.some(tab => tab.id === tabId)) return
      this.activeTabId = tabId
      this.saveTabsState()
    },
    removeTab(tabId: string) {
      const index = this.tabs.findIndex(tab => tab.id === tabId)
      if (index < 0) return
      const nextActiveId = this.tabs[index + 1]?.id || this.tabs[index - 1]?.id || null
      this.tabs.splice(index, 1)
      if (this.activeTabId === tabId) {
        this.activeTabId = nextActiveId
      }
      this.saveTabsState()
    },
    toggleZen() {
      this.isZen = !this.isZen
    },
    toggleStar(path: string) {
      const idx = this.starredFiles.indexOf(path)
      if (idx > -1) this.starredFiles.splice(idx, 1)
      else this.starredFiles.push(path)
      this.saveTabsState()
    },
    isStarred(path: string) {
      return this.starredFiles.includes(path)
    },
    saveTabsState() {
      if (!this.activeLibraryPath) return
      try {
        const persistentTabs = this.tabs
          .filter(tab => !tab.external)
          .map(tab => ({
            id: tab.id,
            title: tab.title,
            path: tab.path,
            isDirty: false,
          }))
        const persistentActiveTabId = persistentTabs.some(tab => tab.id === this.activeTabId)
          ? this.activeTabId
          : (persistentTabs[0]?.id || null)
        const state = {
          tabs: persistentTabs,
          activeTabId: persistentActiveTabId,
          recentFiles: this.recentFiles,
          starredFiles: this.starredFiles
        }
        localStorage.setItem(libraryTabsKey(this.activeLibraryPath), JSON.stringify(state))
      } catch (e) { /* storage full or unavailable */ }
    },
    restoreTabsState() {
      try {
        if (!this.activeLibraryPath) return
        const raw = localStorage.getItem(libraryTabsKey(this.activeLibraryPath)) || localStorage.getItem(TABS_STORAGE_KEY)
        if (!raw) return
        const state = JSON.parse(raw)
        if (state.tabs && Array.isArray(state.tabs)) {
          this.tabs = sessionTabs(this.activeLibraryPath, state.tabs)
          this.activeTabId = this.tabs.some(tab => tab.id === state.activeTabId)
            ? state.activeTabId
            : (this.tabs[0]?.id || null)
        }
        if (state.recentFiles && Array.isArray(state.recentFiles)) {
          this.recentFiles = state.recentFiles.filter((file: any) => file && belongsToLibrary(this.activeLibraryPath, file.path))
        }
        if (state.starredFiles && Array.isArray(state.starredFiles)) {
          this.starredFiles = state.starredFiles.filter((path: unknown) => belongsToLibrary(this.activeLibraryPath, path))
        }
      } catch (e) { /* Preserve unreadable records for recovery; never erase them on load. */ }
    },
    clearTabsState() {
      try { localStorage.removeItem(libraryTabsKey(this.activeLibraryPath)) } catch (e) {}
    }
  }
})
