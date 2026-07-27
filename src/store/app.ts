import { defineStore } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import { enable, disable, isEnabled } from '@tauri-apps/plugin-autostart'
import {
  THEME_EDITOR_BACKGROUNDS,
  getThemePreset,
  normalizeThemeName,
  type ThemeMotionSpeed,
  type ThemeName,
  type VisualStyle,
} from '../config/themePresets'

export type SessionMode = 'TEMP' | 'LIBRARY'

export const THEME_MAP = THEME_EDITOR_BACKGROUNDS

export interface TabInfo {
  id: string
  title: string
  path: string
  isDirty: boolean
  content?: string
  textSignature?: string
  textEncoding?: string
  textBom?: string
  textLineEnding?: string
  textHasFinalNewline?: boolean
  textReadEncoding?: string
  textReadOnlyReason?: string
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
  gitEnabled?: boolean
  gitRemote?: string
  gitBranch?: string
}

export interface SavedSearchConfig {
  id: string
  name: string
  query: string
  libraryPath: string
  objectTypes: string[]
  createdAt: number
}

export interface RelationObjectFocus {
  path: string
  locatorKind: string
  locatorObjectId: string
  locatorPage?: number
}

const TABS_STORAGE_KEY = 'longedit_tabs_state'

export const useAppStore = defineStore('app', {
  state: () => ({
    activeSession: 'LIBRARY' as SessionMode,
    tabs: [] as TabInfo[],
    activeTabId: null as string | null,
    theme: 'system' as ThemeName,
    codeTheme: 'github' as string,
    editorMode: 'wysiwyg' as 'wysiwyg' | 'ir' | 'sv',
    editorBgColor: '' as string,
    heroIcon: 'BookOpen' as string,
    libraries: [] as LibraryConfig[],
    activeLibraryPath: '',
    autoSaveInterval: 3,
    textAutoSaveEnabled: true,
    maxHistoryCount: 10,
    isAutostart: false,
    isDefaultEditor: false,
    exitStrategy: 'ask' as 'ask' | 'quit' | 'minimize',
    isTempDirty: false,
    isZen: false,
    visualStyle: 'soft' as VisualStyle,
    motionSpeed: 'calm' as ThemeMotionSpeed,
    aiEnabled: false,
    aiProvider: 'openai',
    aiEndpoint: 'https://api.openai.com/v1',
    aiCredentialStored: false,
    aiModel: 'gpt-4o-mini',
    recentFiles: [] as { title: string; path: string }[],
    starredFiles: [] as string[],
    savedSearches: [] as SavedSearchConfig[],
    relationObjectFocus: null as RelationObjectFocus | null,
  }),
  getters: {
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
      try {
        const config = await invoke<any>('get_config')
        this.libraries = (config.libraries || []).map((l: any) => ({ ...l, gitEnabled: l.gitEnabled || false, gitRemote: l.gitRemote || '', gitBranch: l.gitBranch || 'main' }))
        this.activeLibraryPath = config.activeLibraryPath || ''
        this.theme = normalizeThemeName(config.theme)
        this.codeTheme = config.codeTheme || 'github'
        this.editorMode = config.editorMode || 'wysiwyg'
        this.editorBgColor = config.editorBgColor || ''
        this.heroIcon = config.heroIcon || 'BookOpen'
        this.autoSaveInterval = config.autoSaveInterval || 3
        this.textAutoSaveEnabled = config.textAutoSaveEnabled !== false
        this.maxHistoryCount = config.maxHistoryCount || 10
        this.exitStrategy = config.exitStrategy || 'ask'
        this.visualStyle = config.visualStyle || 'soft'
        this.motionSpeed = config.motionSpeed || 'calm'
        this.aiEnabled = config.aiEnabled || false
        this.aiProvider = config.aiProvider || 'openai'
        this.aiEndpoint = config.aiEndpoint || 'https://api.openai.com/v1'
        try { this.aiCredentialStored = await invoke<boolean>('get_ai_credential_status') }
        catch { this.aiCredentialStored = false }
        this.aiModel = config.aiModel || 'gpt-4o-mini'
        this.savedSearches = Array.isArray(config.savedSearches) ? config.savedSearches : []

        // 同步系统真实的自启状态，以系统为准
        try {
          this.isAutostart = await isEnabled()
        } catch (e) {
          this.isAutostart = config.isAutostart || false
        }
        
        // 校准系统默认关联状态
        await this.checkSystemStatus()
        // 恢复上一次的标签页
        this.restoreTabsState()
      } catch (e) { console.error('Failed to load config', e) }
    },
    async checkSystemStatus() {
      try {
        this.isDefaultEditor = await invoke<boolean>('check_association_status')
      } catch (e) {
        console.error('Failed to check association status', e)
      }
    },
    async updateConfig(patch: any) {
      // 检测文件库切换，若切换则清空标签页
      if (patch.activeLibraryPath !== undefined && patch.activeLibraryPath !== this.activeLibraryPath) {
        this.tabs = []
        this.activeTabId = null
        this.relationObjectFocus = null
        this.clearTabsState()
      }

      // 核心修复：真实调用自启插件
      if (patch.isAutostart !== undefined && patch.isAutostart !== this.isAutostart) {
        try {
          if (patch.isAutostart) await enable()
          else await disable()
        } catch (e) {
          console.error('Autostart plugin error', e)
          patch.isAutostart = this.isAutostart // 如果操作失败，回滚 patch 值
        }
      }

      for (const key in patch) {
        if (patch[key] !== undefined) {
          (this as any)[key] = patch[key]
        }
      }
      if (patch.libraries !== undefined) {
        const libraryPaths = new Set(this.libraries.map(library => library.path))
        this.savedSearches = this.savedSearches.filter(search => libraryPaths.has(search.libraryPath))
      }
      
      await invoke('save_config', { config: {
        libraries: this.libraries,
        activeLibraryPath: this.activeLibraryPath,
        theme: this.theme,
        codeTheme: this.codeTheme,
        editorMode: this.editorMode,
        editorBgColor: this.editorBgColor,
        heroIcon: this.heroIcon,
        autoSaveInterval: this.autoSaveInterval,
        textAutoSaveEnabled: this.textAutoSaveEnabled,
        maxHistoryCount: this.maxHistoryCount,
        isAutostart: this.isAutostart,
        exitStrategy: this.exitStrategy,
        visualStyle: this.visualStyle,
        motionSpeed: this.motionSpeed,
        aiEnabled: this.aiEnabled,
        aiProvider: this.aiProvider,
        aiEndpoint: this.aiEndpoint,
        aiModel: this.aiModel,
        savedSearches: this.savedSearches,
      } })

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
      const duplicate = this.savedSearches.find(search => search.libraryPath === this.activeLibraryPath
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
        createdAt: Date.now(),
      }
      const previous = this.savedSearches
      try { await this.updateConfig({ savedSearches: [savedSearch, ...previous] }) }
      catch (error) { this.savedSearches = previous; throw error }
      return savedSearch
    },
    async removeSavedSearch(id: string) {
      const previous = this.savedSearches
      try { await this.updateConfig({ savedSearches: previous.filter(search => search.id !== id) }) }
      catch (error) { this.savedSearches = previous; throw error }
    },
    addTab(tab: TabInfo) {
      const idx = this.tabs.findIndex(t => t.path === tab.path)
      if (idx > -1) {
        const existing = this.tabs[idx]
        if (tab.content !== undefined) existing.content = tab.content
        if (tab.textSignature !== undefined) existing.textSignature = tab.textSignature
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
        const [removed] = this.tabs.splice(idx, 1)
        this.tabs.unshift(removed)
        if (this.activeTabId !== existing.id) {
          this.activeTabId = existing.id
        }
      } else {
        this.tabs.unshift(tab)
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
        localStorage.setItem(TABS_STORAGE_KEY, JSON.stringify(state))
      } catch (e) { /* storage full or unavailable */ }
    },
    restoreTabsState() {
      try {
        const raw = localStorage.getItem(TABS_STORAGE_KEY)
        if (!raw) return
        const state = JSON.parse(raw)
        if (state.tabs && Array.isArray(state.tabs)) {
          this.tabs = state.tabs
            .filter((tab: any) => tab.path && !tab.external)
            .map((tab: any) => ({ ...tab, isDirty: false }))
          this.activeTabId = this.tabs.some(tab => tab.id === state.activeTabId)
            ? state.activeTabId
            : (this.tabs[0]?.id || null)
        }
        if (state.recentFiles && Array.isArray(state.recentFiles)) {
          this.recentFiles = state.recentFiles
        }
        if (state.starredFiles && Array.isArray(state.starredFiles)) {
          this.starredFiles = state.starredFiles
        }
      } catch (e) { localStorage.removeItem(TABS_STORAGE_KEY) }
    },
    clearTabsState() {
      try { localStorage.removeItem(TABS_STORAGE_KEY) } catch (e) {}
    }
  }
})
