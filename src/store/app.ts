import { defineStore } from 'pinia'
import { invoke } from '@tauri-apps/api/core'

export type SessionMode = 'TEMP' | 'LIBRARY'

export interface TabInfo {
  id: string
  title: string
  path: string
  isDirty: boolean
}

export interface LibraryConfig {
  name: string
  path: string
}

export const useAppStore = defineStore('app', {
  state: () => ({
    activeSession: 'LIBRARY' as SessionMode,
    tabs: [] as TabInfo[],
    activeTabId: null as string | null,
    theme: 'system' as 'white' | 'dark' | 'system' | 'green' | 'blue' | 'pink',
    codeTheme: 'github' as string,
    editorMode: 'wysiwyg' as 'wysiwyg' | 'ir' | 'sv',
    editorBgColor: '' as string,
    libraries: [] as LibraryConfig[],
    activeLibraryPath: '',
    autoSaveInterval: 3,
    maxHistoryCount: 10,
    isZen: false,
  }),
  getters: {
    libraryPath: (state) => state.activeLibraryPath,
    currentLibraryName: (state) => {
      const lib = state.libraries.find(l => l.path === state.activeLibraryPath)
      return lib ? lib.name : '未关联文件库'
    }
  },
  actions: {
    async loadConfig() {
      try {
        const config = await invoke<any>('get_config')
        this.libraries = config.libraries || []
        this.activeLibraryPath = config.activeLibraryPath || ''
        this.theme = config.theme || 'system'
        this.codeTheme = config.codeTheme || 'github'
        this.editorMode = config.editorMode || 'wysiwyg'
        this.editorBgColor = config.editorBgColor || ''
        this.autoSaveInterval = config.autoSaveInterval || 3
        this.maxHistoryCount = config.maxHistoryCount || 10
      } catch (e) { console.error('Failed to load config', e) }
    },
    async updateConfig(patch: any) {
      // 检测文件库切换，若切换则清空标签页
      if (patch.activeLibraryPath !== undefined && patch.activeLibraryPath !== this.activeLibraryPath) {
        this.tabs = []
        this.activeTabId = null
      }

      for (const key in patch) {
        if (patch[key] !== undefined) {
          (this as any)[key] = patch[key]
        }
      }
      
      await invoke('save_config', { config: {
        libraries: this.libraries,
        activeLibraryPath: this.activeLibraryPath,
        theme: this.theme,
        codeTheme: this.codeTheme,
        editorMode: this.editorMode,
        editorBgColor: this.editorBgColor,
        autoSaveInterval: this.autoSaveInterval,
        maxHistoryCount: this.maxHistoryCount
      } })
    },
    addTab(tab: TabInfo) {
      const exists = this.tabs.find(t => t.path === tab.path)
      if (exists) {
        this.activeTabId = exists.id
      } else {
        this.tabs.push(tab)
        this.activeTabId = tab.id
      }
    },
    removeTab(tabId: string) {
      this.tabs = this.tabs.filter(t => t.id !== tabId)
      if (this.activeTabId === tabId) {
        this.activeTabId = this.tabs.length > 0 ? this.tabs[this.tabs.length - 1].id : null
      }
    },
    toggleZen() {
      this.isZen = !this.isZen
    }
  }
})
