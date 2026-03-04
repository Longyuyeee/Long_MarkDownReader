import { defineStore } from 'pinia'
import { invoke } from '@tauri-apps/api/core'

export type SessionMode = 'TEMP' | 'LIBRARY'

export interface TabInfo {
  id: string
  title: string
  path: string
  isDirty: boolean
}

export const useAppStore = defineStore('app', {
  state: () => ({
    activeSession: 'LIBRARY' as SessionMode,
    tabs: [] as TabInfo[],
    activeTabId: null as string | null,
    theme: 'system' as 'light' | 'dark' | 'system',
    libraryPath: '',
    autoSaveInterval: 3,
    maxHistoryCount: 10,
    isZen: false,
  }),
  actions: {
    async loadConfig() {
      try {
        const config = await invoke<any>('get_config')
        this.libraryPath = config.libraryPath
        this.theme = config.theme
        this.autoSaveInterval = config.autoSaveInterval || 3
        this.maxHistoryCount = config.maxHistoryCount || 10
      } catch (e) { console.error('Failed to load config', e) }
    },
    async updateConfig(patch: any) {
      Object.assign(this, patch)
      // 直接传递对象，Rust 端通过 camelCase 自动解析
      await invoke('save_config', { config: {
        libraryPath: this.libraryPath,
        theme: this.theme,
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
